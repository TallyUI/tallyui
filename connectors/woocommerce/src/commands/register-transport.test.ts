import { describe, expect, it, vi } from 'vitest';
import type { RegisterCommandEnvelope, RegisterCommandType, SyncContext } from '@tallyui/core';
import { createWooRegisterTransport, wooApproveSession } from '../index';

const baseUrl = 'https://shop.example/wp-json/wcpos/v2';
const uuid = (n: number) => `019965af-0000-7000-8000-00000000000${n}`;
const SESSION = uuid(1), REGISTER = uuid(2), MOVEMENT = uuid(3), CLOSURE = uuid(4);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function envelope(type: RegisterCommandType | 'register.session.carry', payload: Record<string, unknown>, id = 'cmd-1'): RegisterCommandEnvelope {
  return { id, type: type as RegisterCommandType, version: 3, createdAt: '2026-11-20T09:00:00.000Z', deviceId: 'device-1', attempt: 1, payload };
}
const open = (extra: Record<string, unknown> = {}, id?: string) => envelope('register.session.open',
  { sessionId: SESSION, registerId: REGISTER, openedAt: '2026-11-20T09:00:00.000Z', countedFloatMinor: 15000, ...extra }, id);
const closure = (extra: Record<string, unknown> = {}) => envelope('register.closure.submit', {
  closureId: CLOSURE, sessionId: SESSION, registerId: REGISTER, number: 5, openedAt: '2026-11-20T09:00:00.000Z',
  closedAt: '2026-11-20T17:00:00.000Z', tillExpected: { cash: -500 }, counted: { cash: 15000 },
  periodSalesTotalMinor: 12345, periodRefundsTotalMinor: 100, perpetualSalesTotalMinor: 999999, perpetualRefundsTotalMinor: 2500,
  unsyncedCount: 0, unsyncedTotalMinor: 0, softwareVersion: 'tallyui 3.4.0', orderIds: ['o1'], movementIds: [MOVEMENT],
  approvedBy: '7', approval: 'wcpos-approve:x:7', ...extra });

// Answers as v2.0.4's Sessions_Controller and Closures_Controller do on success; `queue` overrides answers per path, in order.
function store({ currency = 'USD' as string | (() => string), queue = {} as Record<string, Array<Response | Error>> } = {}) {
  const calls: Array<{ path: string; method?: string; body?: ReturnType<typeof JSON.parse> }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = String(url).slice(baseUrl.length + 1), body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method: init?.method, body });
    const queued = queue[path]?.shift();
    if (queued instanceof Error) throw queued;
    if (queued) return queued;
    if (path === 'sessions') return json(201, { id: body.id, status: 'open', register_id: body.register_id });
    if (path.endsWith('/status')) return json(200, { id: path.split('/')[1], status: body.status });
    if (path === 'movements') return json(201, { id: body.id, type: body.type });
    if (path === 'closures') return json(201, { id: 42, number: body.number });
    return json(404, { code: 'rest_no_route' });
  });
  const transport = createWooRegisterTransport({ baseUrl, fetch, getHeaders: () => ({ 'X-WCPOS': '1' }), currency });
  return { calls, fetch, transport };
}

describe('createWooRegisterTransport: register.session.open', () => {
  it('T1: posts exactly the named keys, as decimals at the currency digits', async () => {
    const { calls, transport } = store();
    expect(await transport.send([open({ expectedFloatMinor: 14000, businessDay: '2026-11-20' })])).toStrictEqual({ kind: 'results', results: [
      { id: 'cmd-1', status: 'applied', register: { session: { id: SESSION, status: 'open' } } }] });
    expect(calls).toStrictEqual([{ path: 'sessions', method: 'POST', body: { id: SESSION, register_id: REGISTER,
      opened_at: '2026-11-20T09:00:00.000Z', counted_float: '150.00', expected_float: '140.00', business_day: '2026-11-20' } }]);
  });

  it('T1: sends JPY with no decimals and leaves business_day out when the payload has none', async () => {
    const { calls, transport } = store({ currency: () => 'JPY' });
    await transport.send([open({ countedFloatMinor: 150 })]);
    expect(calls[0].body).toStrictEqual({ id: SESSION, register_id: REGISTER, opened_at: '2026-11-20T09:00:00.000Z', counted_float: '150' });
  });

  it('T1: sends neither supersedes nor deviceName, nor the other till-only fields', async () => {
    const { calls, transport } = store();
    await transport.send([open({ supersedes: uuid(9), deviceName: 'Front till', openingVarianceMinor: 0, storeKey: 's', openedBy: '3', businessDay: '' })]);
    expect(Object.keys(calls[0].body).sort()).toStrictEqual(['counted_float', 'id', 'opened_at', 'register_id']);
  });

  it('T1: a 200 replay is applied, and a status the till does not know is left out', async () => {
    const { transport } = store({ queue: { sessions: [json(200, { id: SESSION, status: 'counting' }), json(200, { id: SESSION, status: 'carried' })] } });
    expect(await transport.send([open({}, 'a'), open({}, 'b')])).toStrictEqual({ kind: 'results', results: [
      { id: 'a', status: 'applied', register: { session: { id: SESSION, status: 'counting' } } },
      { id: 'b', status: 'applied', register: { session: { id: SESSION } } }] });
  });

  it('T2: a 409 wcpos_session_already_open names the store session', async () => {
    const { transport } = store({ queue: { sessions: [
      json(409, { code: 'wcpos_session_already_open', message: 'This register already has an open session.', data: { status: 409, session_id: 'S2' } }),
      json(409, { code: 'wcpos_session_already_open', data: { status: 409 } }),
      json(409, { code: 'wcpos_session_write_conflict', message: 'No.' })] } });
    const outcome = await transport.send([open({}, 'a'), open({}, 'b'), open({}, 'c')]);
    expect(outcome).toMatchObject({ kind: 'results', results: [
      { id: 'a', status: 'rejected', error: { code: 'register_session_already_open', data: { sessionId: 'S2' } } },
      { id: 'b', status: 'rejected', error: { code: 'register_session_already_open', data: { sessionId: SESSION } } },
      { id: 'c', status: 'rejected', error: { code: 'register_session_open_refused', data: { storeCode: 'wcpos_session_write_conflict' } } }] });
  });
});

describe('createWooRegisterTransport: register.session.transition', () => {
  const transition = (status: string) => envelope('register.session.transition', { sessionId: SESSION, status, at: '2026-11-20T16:55:00.000Z' });

  it('T3: counting posts the status route with status and at only', async () => {
    const { calls, transport } = store();
    expect(await transport.send([transition('counting')])).toStrictEqual({ kind: 'results', results: [
      { id: 'cmd-1', status: 'applied', register: { session: { id: SESSION, status: 'counting' } } }] });
    expect(calls).toStrictEqual([{ path: `sessions/${SESSION}/status`, method: 'POST', body: { status: 'counting', at: '2026-11-20T16:55:00.000Z' } }]);
  });

  it('T3: closed is applied with no request', async () => {
    const { calls, transport } = store();
    expect(await transport.send([transition('closed')])).toStrictEqual({ kind: 'results', results: [{ id: 'cmd-1', status: 'applied' }] });
    expect(calls).toStrictEqual([]);
  });

  it('T3: a 409 is refused with the store code, a 404 is unknown', async () => {
    const { transport } = store({ queue: { [`sessions/${SESSION}/status`]: [
      json(409, { code: 'wcpos_session_transition_refused' }), json(404, { code: 'wcpos_session_not_found' })] } });
    expect(await transport.send([transition('open'), transition('counting')])).toMatchObject({ kind: 'results', results: [
      { status: 'rejected', error: { code: 'register_session_transition_refused', data: { storeCode: 'wcpos_session_transition_refused' } } },
      { status: 'rejected', error: { code: 'register_session_unknown' } }] });
  });
});

describe('createWooRegisterTransport: movements', () => {
  const record = (extra: Record<string, unknown> = {}) => envelope('register.movement.record', { movementId: MOVEMENT, sessionId: SESSION,
    type: 'paid_in', amountMinor: 250, reason: 'Float top-up', createdAt: '2026-11-20T10:00:00.000Z', createdBy: '3', ...extra });

  it('T4: a paid_in posts exactly the named keys with a decimal amount', async () => {
    const { calls, transport } = store();
    expect(await transport.send([record()])).toStrictEqual({ kind: 'results', results: [{ id: 'cmd-1', status: 'applied' }] });
    expect(calls).toStrictEqual([{ path: 'movements', method: 'POST', body: { id: MOVEMENT, session_id: SESSION, type: 'paid_in',
      amount: '2.50', reason: 'Float top-up', created_at: '2026-11-20T10:00:00.000Z' } }]);
  });

  it('T4: a void posts type void, amount 0, an empty reason and voids', async () => {
    const { calls, transport } = store({ queue: { movements: [json(200, { id: uuid(5) })] } });
    const voided = envelope('register.movement.void', { movementId: uuid(5), sessionId: SESSION, voids: MOVEMENT,
      createdAt: '2026-11-20T10:05:00.000Z', createdBy: '3' });
    expect(await transport.send([voided])).toStrictEqual({ kind: 'results', results: [{ id: 'cmd-1', status: 'applied' }] });
    expect(calls[0].body).toStrictEqual({ id: uuid(5), session_id: SESSION, type: 'void', amount: '0', reason: '', voids: MOVEMENT,
      created_at: '2026-11-20T10:05:00.000Z' });
  });

  it("T4: a 409 is refused with the store's message", async () => {
    const { transport } = store({ queue: { movements: [json(409, { code: 'wcpos_session_not_open', message: 'The session request could not be completed.' })] } });
    expect(await transport.send([record()])).toStrictEqual({ kind: 'results', results: [{ id: 'cmd-1', status: 'rejected', error: {
      code: 'register_movement_refused', message: 'The session request could not be completed.', data: { storeCode: 'wcpos_session_not_open' } } }] });
  });

  it.each([-1, 2.5])('T4: amountMinor %d is invalid_payload with no request', async (amountMinor) => {
    const { calls, transport } = store();
    expect(await transport.send([record({ amountMinor })])).toMatchObject({ kind: 'results', results: [
      { id: 'cmd-1', status: 'rejected', error: { code: 'invalid_payload' } }] });
    expect(calls).toStrictEqual([]);
  });
});

describe('createWooRegisterTransport: register.closure.submit', () => {
  const closures = (...answers: Response[]) => ({ queue: { closures: answers } });

  it('T5: moves the session to counting, then posts exactly the closure keys as decimals', async () => {
    const { calls, transport } = store();
    expect(await transport.send([closure({ businessDay: '2026-11-20' })])).toStrictEqual({ kind: 'results', results: [{ id: 'cmd-1', status: 'applied',
      register: { session: { id: SESSION, status: 'closed' }, closure: { serverClosureId: '42', number: 5 } } }] });
    expect(calls).toStrictEqual([
      { path: `sessions/${SESSION}/status`, method: 'POST', body: { status: 'counting', at: '2026-11-20T17:00:00.000Z' } },
      { path: 'closures', method: 'POST', body: { id: CLOSURE, session_id: SESSION, number: 5, opened_at: '2026-11-20T09:00:00.000Z',
        closed_at: '2026-11-20T17:00:00.000Z', business_day: '2026-11-20', software_version: 'tallyui 3.4.0', breakdowns: {},
        till_expected: { cash: '-5.00' }, counted: { cash: '150.00' }, period_sales_total: '123.45', period_refunds_total: '1.00',
        perpetual_sales_total: '9999.99', perpetual_refunds_total: '25.00', unsynced_total: '0.00', unsynced_count: 0 } }]);
    for (const key of ['printed_at', 'approver_token', 'approval', 'order_ids', 'movement_ids', 'approved_by']) expect(calls[1].body).not.toHaveProperty(key);
  });

  it('T5: a tender map without cash gets cash at zero', async () => {
    const { calls, transport } = store();
    await transport.send([closure({ counted: { card: 4200 }, tillExpected: { card: 4200 } })]);
    expect(calls[1].body.counted).toStrictEqual({ cash: '0.00', card: '42.00' });
    expect(calls[1].body.till_expected).toStrictEqual({ cash: '0.00', card: '42.00' });
  });

  it("T5: carries the store's renumbered closure, its id as a string", async () => {
    const { transport } = store(closures(json(201, { id: 77, number: 7 })));
    expect(await transport.send([closure()])).toMatchObject({ kind: 'results', results: [
      { status: 'applied', register: { closure: { serverClosureId: '77', number: 7 } } }] });
  });

  it('T5: a status-call 409 still posts the closure; a 404 is unknown with no closure posted', async () => {
    const { calls, transport } = store({ queue: { [`sessions/${SESSION}/status`]: [json(409, { code: 'wcpos_session_transition_refused' }),
      json(404, { code: 'wcpos_session_not_found' })] } });
    const outcome = await transport.send([closure(), closure()]);
    expect(outcome).toMatchObject({ kind: 'results', results: [{ status: 'applied' }, { status: 'rejected', error: { code: 'register_session_unknown' } }] });
    expect(calls.map(({ path }) => path)).toStrictEqual([`sessions/${SESSION}/status`, 'closures', `sessions/${SESSION}/status`]);
  });

  it('T5: a closure 404 is register_session_unknown with the store code, never a retry', async () => {
    const { transport } = store(closures(json(404, { code: 'wcpos_session_not_found', message: 'x' }), json(404, { code: 'wcpos_closure_not_found' })));
    expect(await transport.send([closure(), closure()])).toMatchObject({ kind: 'results', results: [
      { status: 'rejected', error: { code: 'register_session_unknown', data: { storeCode: 'wcpos_session_not_found' } } },
      { status: 'rejected', error: { code: 'register_session_unknown', data: { storeCode: 'wcpos_closure_not_found' } } }] });
  });

  it("T5: a replay after a lost response (status 409, closure 200) is applied with the store's id and number", async () => {
    const { calls, transport } = store({ queue: { [`sessions/${SESSION}/status`]: [json(409, { code: 'wcpos_session_transition_refused' })],
      closures: [json(200, { id: CLOSURE, number: 5 })] } });
    expect(await transport.send([closure()])).toMatchObject({ kind: 'results', results: [
      { status: 'applied', register: { closure: { serverClosureId: CLOSURE, number: 5 } } }] });
    expect(calls.map(({ path }) => path)).toStrictEqual([`sessions/${SESSION}/status`, 'closures']);
  });

  it.each([[{ counted: { cash: -1 } }], [{ counted: { 'gift card': 100 } }], [{ tillExpected: { cash: 0, ['x'.repeat(192)]: 1 } }]])(
    'T5: %j is invalid_payload with no request', async (extra) => {
      const { calls, transport } = store();
      expect(await transport.send([closure(extra)])).toMatchObject({ kind: 'results', results: [{ status: 'rejected', error: { code: 'invalid_payload' } }] });
      expect(calls).toStrictEqual([]);
    });

  it('T6: a 403 override refusal with a variance asks for approval, threshold truncated, variance signed', async () => {
    const refusal = (variance: string) => json(403, { code: 'wcpos_override_refused', message: 'Manager approval is required to close this session.',
      data: { status: 403, variance, threshold: '5.00' } });
    const { transport } = store(closures(refusal('20.0000'), refusal('-20.0000')));
    expect(await transport.send([closure(), closure()])).toStrictEqual({ kind: 'results', results: [
      { id: 'cmd-1', status: 'rejected', error: { code: 'register_approval_required', message: 'Manager approval is required to close this session.',
        data: { sessionId: SESSION, thresholdMinor: 500, variance: { cash: 2000 } } } },
      { id: 'cmd-1', status: 'rejected', error: { code: 'register_approval_required', message: 'Manager approval is required to close this session.',
        data: { sessionId: SESSION, thresholdMinor: 500, variance: { cash: -2000 } } } }] });
  });

  it('T6: a 403 override refusal without a variance is an unknown approval; closure 409s map by code', async () => {
    const { transport } = store(closures(json(403, { code: 'wcpos_override_refused', data: { status: 403 } }),
      json(409, { code: 'wcpos_closure_exists' }), json(409, { code: 'wcpos_closure_number_invalid' }), json(409, { code: 'wcpos_closure_session_invalid' })));
    expect(await transport.send([closure(), closure(), closure(), closure()])).toMatchObject({ kind: 'results', results: [
      { status: 'rejected', error: { code: 'register_approval_invalid', data: { reason: 'unknown' } } },
      { status: 'rejected', error: { code: 'register_closure_exists' } },
      { status: 'rejected', error: { code: 'register_closure_number_invalid' } },
      { status: 'rejected', error: { code: 'register_closure_refused', data: { storeCode: 'wcpos_closure_session_invalid' } } }] });
  });
});

describe('createWooRegisterTransport: batches and shared answers', () => {
  it('T7: a 503 on the second command returns only the first result; on the first, a retry', async () => {
    const second = store({ queue: { sessions: [json(201, { id: SESSION, status: 'open' }), json(503, {})] } });
    expect(await second.transport.send([open({}, 'a'), open({}, 'b')])).toStrictEqual({ kind: 'results', results: [
      { id: 'a', status: 'applied', register: { session: { id: SESSION, status: 'open' } } }] });
    const first = store({ queue: { sessions: [json(503, {})] } });
    expect(await first.transport.send([open({}, 'a'), open({}, 'b')])).toStrictEqual({ kind: 'retry', reason: 'status_503' });
    expect(first.calls).toHaveLength(1);
  });

  it('T7: a fetch that throws is a network retry', async () => {
    const { transport } = store({ queue: { sessions: [new TypeError('Failed to fetch')] } });
    expect(await transport.send([open()])).toStrictEqual({ kind: 'retry', reason: 'network' });
  });

  it('T7: 401 and 403 rest_forbidden are unauthorized, 426 is refused, 400 is invalid_payload', async () => {
    expect(await store({ queue: { sessions: [json(401, { code: 'rest_forbidden' })] } }).transport.send([open()])).toStrictEqual({ kind: 'unauthorized' });
    expect(await store({ queue: { movements: [json(403, { code: 'rest_forbidden' })] } }).transport.send([
      envelope('register.movement.void', { movementId: uuid(5), sessionId: SESSION, voids: MOVEMENT, createdAt: '2026-11-20T10:05:00.000Z' })]))
      .toStrictEqual({ kind: 'unauthorized' });
    expect(await store({ queue: { closures: [json(426, { code: 'wcpos_update_required' })] } }).transport.send([closure()]))
      .toStrictEqual({ kind: 'refused', status: 426, reason: 'wcpos_update_required' });
    expect(await store({ queue: { sessions: [json(400, { code: 'rest_invalid_param', message: 'The session request could not be completed.' })] } })
      .transport.send([open()])).toStrictEqual({ kind: 'results', results: [{ id: 'cmd-1', status: 'rejected',
      error: { code: 'invalid_payload', message: 'The session request could not be completed.', data: { storeCode: 'rest_invalid_param' } } }] });
  });

  it('T7: an unknown type is rejected with no request', async () => {
    const { calls, transport } = store();
    expect(await transport.send([envelope('register.session.carry', { sessionId: SESSION })])).toStrictEqual({ kind: 'results', results: [
      { id: 'cmd-1', status: 'rejected', error: { code: 'invalid_payload', message: 'unsupported register command register.session.carry' } }] });
    expect(calls).toStrictEqual([]);
  });
});

describe('wooApproveSession', () => {
  const credentials = { username: 'manager-name', password: 'secret-pass-123' };
  function approveStore(...answers: Response[]) {
    const calls: Array<{ path: string; body?: ReturnType<typeof JSON.parse> }> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      const path = String(url).slice(baseUrl.length + 1);
      calls.push({ path, body: JSON.parse(String(init?.body)) });
      if (path.endsWith('/status')) return json(200, { id: SESSION, status: 'counting' });
      return answers.shift() ?? json(200, { id: SESSION, approved_by: 3, approved_counted: { cash: '150.0000' } });
    });
    const context: SyncContext = { connectorId: 'woocommerce', baseUrl, headers: { 'X-WCPOS': '1' }, fetch };
    return { calls, approve: () => wooApproveSession(context, { sessionId: SESSION, credentials, counted: { cash: 15000 }, currency: 'USD' }) };
  }

  it('T8: moves the session to counting, then approves with the counted decimals', async () => {
    const { calls, approve } = approveStore();
    expect(await approve()).toStrictEqual({ approval: `wcpos-approve:${SESSION}:3`, approvedBy: '3' });
    expect(calls.map(({ path }) => path)).toStrictEqual([`sessions/${SESSION}/status`, `sessions/${SESSION}/approve`]);
    expect(calls[0].body).toMatchObject({ status: 'counting' });
    expect(calls[1].body).toStrictEqual({ username: 'manager-name', password: 'secret-pass-123', counted: { cash: '150.00' } });
  });

  it.each([
    ['a mismatched approved_counted', json(200, { approved_by: 3, approved_counted: { cash: '149.0000' } }), { refused: 'override_refused' }],
    ['an extra approved tender', json(200, { approved_by: 3, approved_counted: { cash: '150.0000', card: '0.0000' } }), { refused: 'override_refused' }],
    ['a 403', json(403, { code: 'wcpos_override_refused' }), { refused: 'override_refused' }],
    ['a 409', json(409, { code: 'wcpos_session_transition_refused' }), { refused: 'not_counting' }],
  ])('T8: %s answers %j', async (_, answer, expected) => {
    expect(await approveStore(answer).approve()).toStrictEqual(expected);
  });

  it('T8: a counting 404 answers not_counting with no approve request', async () => {
    const paths: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      paths.push(String(url).slice(baseUrl.length + 1));
      return json(404, { code: 'wcpos_session_not_found' });
    });
    const context: SyncContext = { connectorId: 'woocommerce', baseUrl, headers: {}, fetch };
    expect(await wooApproveSession(context, { sessionId: SESSION, credentials, counted: { cash: 15000 }, currency: 'USD' }))
      .toStrictEqual({ refused: 'not_counting' });
    expect(paths).toStrictEqual([`sessions/${SESSION}/status`]);
  });

  it('T8: a 500 throws without the username or password in the message', async () => {
    const error = await approveStore(json(500, { code: 'wcpos_session_write_failed' })).approve().catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('WooCommerce approve: HTTP 500');
    expect((error as Error).message).not.toContain('manager-name');
    expect((error as Error).message).not.toContain('secret-pass-123');
  });
});
