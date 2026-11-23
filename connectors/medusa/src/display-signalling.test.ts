// #1219 (ADR-085 Medusa U7): the medusapos display signalling client, against a fake plugin over core's memory server.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisplaySignallingError, type DisplaySignallingErrorCode, type SyncContext, type TillDevice } from '@tallyui/core';
import { displaySignallingContract } from '@tallyui/core/server';
import { createFakeDisplayServer, type RecordedRequest } from './__tests__/display-signalling-server';
import { readCapabilities } from './capabilities';
import { medusaDisplaySignalling as s } from './display-signalling';
import { createMedusaAdminUserConnector, createMedusaConnector, medusaDisplaySignalling as exported } from './index';

const START = Date.UTC(2026, 10, 11, 9);
const BASE = 'http://medusa.test/tally/v1';
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

function setup() {
  let now = START;
  const fake = createFakeDisplayServer({ now: () => now });
  return { ...fake, h: { ...fake.harness, advance: async (ms: number) => { now += ms; } } };
}
type Fake = ReturnType<typeof setup>;

const pathOf = (r: RecordedRequest): string => new URL(r.url).pathname;
const isDisplay = (r: RecordedRequest): boolean => pathOf(r).startsWith('/tally/v1/display/');

/** The refusal `promise` rejects with; fails when it resolves. */
async function refusal(promise: Promise<unknown>): Promise<DisplaySignallingError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DisplaySignallingError);
    return error as DisplaySignallingError;
  }
  throw new Error('expected a refusal, but it resolved');
}
const codeOf = async (promise: Promise<unknown>): Promise<DisplaySignallingErrorCode> => (await refusal(promise)).code;

/** A till with a registered device and one display paired end to end through the fake. */
async function paired(f: Fake) {
  const a = await f.h.till({ cashierId: 'cashier-a', canPair: true });
  const device: TillDevice = { deviceId: 'till-a', deviceKey: (await s.registerDevice(a, 'till-a')).deviceKey };
  const d = f.h.display('192.0.2.1');
  const { code } = await s.mint(a, device);
  const claim = await s.claim(d, { code, displayName: 'Counter' });
  const [entry] = await s.pending(a, device);
  await s.confirm(a, device, entry!.claimId);
  const result = await s.collect(d, claim.claimSecret);
  if (result.status !== 'paired') throw new Error('not paired');
  return { a, device, d, code, claim, displayId: result.displayId, token: result.token };
}

/** Registers a device and makes each of the 9 till calls once; the display side seeds what a call needs. */
async function tillRun(f: Fake) {
  const a = await f.h.till({ cashierId: 'cashier-a', canPair: true });
  const device: TillDevice = { deviceId: 'till-a', deviceKey: (await s.registerDevice(a, 'till-a')).deviceKey };
  const d = f.h.display('192.0.2.1');
  const codes = [(await s.mint(a, device)).code];
  const claim = await s.claim(d, { code: codes[0]!, displayName: 'One' });
  await s.confirm(a, device, (await s.pending(a, device))[0]!.claimId);
  const result = await s.collect(d, claim.claimSecret);
  if (result.status !== 'paired') throw new Error('not paired');
  codes.push((await s.mint(a, device)).code);
  const other = await s.claim(f.h.display('192.0.2.2'), { code: codes[1]!, displayName: 'Two' });
  await s.decline(a, device, (await s.pending(a, device))[0]!.claimId);
  await s.list(a, device);
  await s.sendSignal(a, device, result.displayId, { type: 'offer', payload: 'o1' });
  await s.displaySendSignal(d, result.token, { type: 'answer', payload: 'a1' });
  await s.receiveSignals(a, device);
  await s.displayReceiveSignals(d, result.token);
  await s.postSnapshot(a, device, result.displayId, { v: 1 });
  await s.forget(a, device, result.displayId);
  return { a, device, codes, secrets: [device.deviceKey, result.token, claim.claimSecret, other.claimSecret, ...codes] };
}

/** Pairs a display, then makes each of the 5 display calls once, claim with a token. */
async function displayRun(f: Fake) {
  const p = await paired(f);
  const { code } = await s.mint(p.a, p.device);
  const before = f.requests.length;
  const claim = await s.claim(p.d, { code, displayName: 'Moved', token: p.token });
  await s.collect(p.d, claim.claimSecret);
  await s.displaySendSignal(p.d, p.token, { type: 'answer', payload: 'a1' });
  await s.displayReceiveSignals(p.d, p.token);
  await s.readSnapshot(p.d, p.token);
  return { ...p, claim, code, log: f.requests.slice(before), secrets: [p.device.deviceKey, p.token, p.claim.claimSecret, claim.claimSecret, p.code, code] };
}

afterEach(() => vi.restoreAllMocks());

describe('medusaDisplaySignalling contract', () => {
  const make = async () => setup().h;
  for (const c of displaySignallingContract(make)) it(c.name, c.run);
});

describe('medusaDisplaySignalling requests (#1219)', () => {
  it('till calls carry the device id and key, register carries neither', async () => {
    const f = setup();
    const { a, device } = await tillRun(f);
    const till = f.requests.filter((r) => !isDisplay(r));
    const routes = new Set(till.map((r) => `${r.method} ${pathOf(r).replace(/\/[0-9a-f]{32}/, '/:id')}`));
    expect([...routes].sort()).toEqual([
      'DELETE /tally/v1/displays/:id', 'GET /tally/v1/display-pairings', 'GET /tally/v1/displays',
      'POST /tally/v1/display-codes', 'POST /tally/v1/display-devices', 'POST /tally/v1/display-pairings/:id/confirm',
      'POST /tally/v1/display-pairings/:id/decline', 'POST /tally/v1/display-signals/drain', 'POST /tally/v1/displays/:id/signals',
      'PUT /tally/v1/displays/:id/snapshot',
    ]);
    for (const r of till) {
      if (pathOf(r) === '/tally/v1/display-devices') {
        expect(r.headers).not.toHaveProperty('x-tally-device-id');
        expect(r.headers).not.toHaveProperty('x-tally-device-key');
        expect(r.body).toBe(JSON.stringify({ deviceId: 'till-a' }));
      } else {
        expect(r.headers['x-tally-device-id']).toBe(device.deviceId);
        expect(r.headers['x-tally-device-key']).toBe(device.deviceKey);
      }
    }
    const noBody = /^(POST \/tally\/v1\/display-codes|POST .*\/(confirm|decline)|GET .*|DELETE .*|POST .*\/drain)$/;
    const empty = f.requests.filter((r) => noBody.test(`${r.method} ${pathOf(r)}`));
    expect(empty.length).toBeGreaterThanOrEqual(9);
    for (const r of empty) {
      expect(r.body).toBe('');
      expect(r.headers).not.toHaveProperty('content-type');
    }
    const spoof: SyncContext = { ...a, headers: { ...a.headers, 'x-tally-device-key': 'spoof', 'X-Tally-Device-Id': 'spoof-id' } };
    await s.mint(spoof, device);
    expect(f.requests.at(-1)!.headers).toMatchObject({ 'x-tally-device-id': device.deviceId, 'x-tally-device-key': device.deviceKey });
  });

  it('till calls carry the ctx auth and no display token', async () => {
    const f = setup();
    const { a } = await tillRun(f);
    const till = f.requests.filter((r) => !isDisplay(r));
    expect(till.length).toBeGreaterThanOrEqual(10);
    for (const r of till) {
      expect(r.headers.authorization).toBe(a.headers.Authorization);
      expect(r.headers.authorization).toMatch(/^Bearer /);
      expect(r.headers).not.toHaveProperty('x-tally-display-token');
    }
  });

  it('display calls carry no store credential', async () => {
    const f = setup();
    const { log, token, claim, code } = await displayRun(f);
    expect(log.map((r) => `${r.method} ${pathOf(r)}`)).toEqual([
      'POST /tally/v1/display/claim', 'POST /tally/v1/display/collect', 'POST /tally/v1/display/signals',
      'POST /tally/v1/display/signals/drain', 'GET /tally/v1/display/snapshot',
    ]);
    for (const r of log) {
      expect(r.headers).not.toHaveProperty('authorization');
      expect(r.headers).not.toHaveProperty('x-tally-device-id');
      expect(r.headers).not.toHaveProperty('x-tally-device-key');
      expect(r.credentials).toBe('omit');
    }
    const [claimReq, collectReq, ...tokenCalls] = log;
    for (const r of tokenCalls) expect(r!.headers['x-tally-display-token']).toBe(token);
    expect(claimReq!.headers).not.toHaveProperty('x-tally-display-token');
    expect(collectReq!.headers).not.toHaveProperty('x-tally-display-token');
    expect(JSON.parse(claimReq!.body)).toStrictEqual({ code, displayName: 'Moved', token });
    expect(JSON.parse(collectReq!.body)).toStrictEqual({ claimSecret: claim.claimSecret });
    const where = (secret: string) => log.flatMap((r, i) => [
      ...(r.url.includes(secret) ? [`${i}:url`] : []), ...(r.body.includes(secret) ? [`${i}:body`] : []),
      ...Object.entries(r.headers).filter(([, v]) => v.includes(secret)).map(([k]) => `${i}:${k}`),
    ]);
    expect(where(token)).toEqual(['0:body', '2:x-tally-display-token', '3:x-tally-display-token', '4:x-tally-display-token']);
    expect(where(claim.claimSecret)).toEqual(['1:body']);
  });

  it('no secret in a URL', async () => {
    const t = setup(), d = setup();
    const till = await tillRun(t);
    const display = await displayRun(d);
    const urls = [...t.requests, ...d.requests].map((r) => r.url);
    expect(urls.length).toBeGreaterThan(20);
    for (const secret of [...till.secrets, ...display.secrets]) {
      expect(secret.length).toBeGreaterThanOrEqual(6);
      for (const url of urls) expect(url).not.toContain(secret);
    }
  });

  it('a refusal carries no secret and no server text', async () => {
    const spies = CONSOLE.map((name) => vi.spyOn(console, name).mockImplementation(() => {}));
    const f = setup();
    const p = await paired(f);
    const viewer = await f.h.till({ cashierId: 'cashier-viewer', canPair: false });
    const wrongKey = 'wrong-key-' + 'k'.repeat(20), wrongToken = 'wrong-token-' + 't'.repeat(20), unknownSecret = 'unknown-secret-' + 's'.repeat(20);
    const cases: Array<[DisplaySignallingErrorCode, () => Promise<unknown>]> = [
      ['device_refused', () => s.mint(p.a, { deviceId: p.device.deviceId, deviceKey: wrongKey })],
      ['token_refused', () => s.readSnapshot(p.d, wrongToken)],
      ['collect_refused', () => s.collect(p.d, unknownSecret)],
      ['not_found', () => s.forget(p.a, p.device, 'no-such-display')],
      ['forbidden', () => s.mint(viewer, p.device)],
      ['forbidden', () => s.mint({ ...p.a, headers: { Authorization: 'Bearer unknown-session' } }, p.device)],
      ['network', () => { f.fail('reject'); return s.list(p.a, p.device); }],
    ];
    const secrets = [p.device.deviceKey, wrongKey, p.token, wrongToken, p.claim.claimSecret, unknownSecret, 'unknown-session'];
    for (const [code, call] of cases) {
      const error = await refusal(call());
      expect(error.code).toBe(code);
      expect(error.message).toBe(error.code);
      expect(error.cause).toBeUndefined();
      const own = error as unknown as Record<string, unknown>;
      const texts = [String(error), error.stack ?? '', JSON.stringify(Object.getOwnPropertyNames(error).map((k) => own[k]))];
      for (const text of texts) {
        for (const banned of [...secrets, 'server says', 'Unauthorized', 'medusa.test']) expect(text).not.toContain(banned);
      }
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('status and code table (#1219)', () => {
  type Call = 'mint' | 'readSnapshot' | 'postSnapshot' | 'confirm';
  const call = (p: Awaited<ReturnType<typeof paired>>, which: Call): Promise<unknown> => ({
    mint: () => s.mint(p.a, p.device),
    readSnapshot: () => s.readSnapshot(p.d, p.token),
    postSnapshot: () => s.postSnapshot(p.a, p.device, p.displayId, { v: 1 }),
    confirm: () => s.confirm(p.a, p.device, 'claim-x'),
  })[which]();
  const world = async () => {
    const f = setup();
    return { f, p: await paired(f) };
  };
  const send = (body: unknown, status: number) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

  const rows: Array<[string, number, unknown, Call, DisplaySignallingErrorCode]> = [
    ['code by status', 403, { code: 'forbidden', message: 'x' }, 'mint', 'forbidden'],
    ['code by status', 403, { code: 'device_refused', message: 'x' }, 'mint', 'device_refused'],
    ['code by status', 404, { code: 'not_found', message: 'x' }, 'mint', 'not_found'],
    ['code by status', 429, { code: 'limit', message: 'x' }, 'mint', 'limit'],
    ['code by status', 403, { code: 'claim_refused', message: 'x' }, 'readSnapshot', 'claim_refused'],
    ['code by status', 403, { code: 'collect_refused', message: 'x' }, 'readSnapshot', 'collect_refused'],
    ['code by status', 403, { code: 'token_refused', message: 'x' }, 'readSnapshot', 'token_refused'],
    ['status only (M2)', 400, { code: 'server', message: 'bad request' }, 'mint', 'too_large'],
    ['status only (M2)', 400, { code: 'server', message: 'bad request' }, 'readSnapshot', 'too_large'],
    ['status only (M2)', 400, { code: 'server', message: 'bad request' }, 'postSnapshot', 'too_large'],
    ['status only (M2)', 400, '<html>', 'mint', 'too_large'],
    ['status only (M2)', 413, { code: 'too_large', message: 'x' }, 'mint', 'too_large'],
    ['status only (M2)', 413, '', 'readSnapshot', 'too_large'],
    ['codeless till 401 (M5)', 401, { message: 'Unauthorized' }, 'mint', 'forbidden'],
    ['codeless till 401 (M5)', 401, '', 'mint', 'forbidden'],
    ['codeless till 401 (M5)', 401, '<html>', 'mint', 'forbidden'],
    ['display-side 401', 401, { message: 'Unauthorized' }, 'readSnapshot', 'server'],
    ['401 with a code', 401, { code: 'device_refused' }, 'mint', 'server'],
    ['401 with a code', 401, { code: 'forbidden' }, 'mint', 'server'],
    ['mismatched', 403, { code: 'not_found' }, 'mint', 'server'],
    ['mismatched', 404, { code: 'limit' }, 'mint', 'server'],
    ['codeless 403', 403, { message: 'x' }, 'mint', 'server'],
    ['server', 500, {}, 'mint', 'server'],
    ['server', 502, '<html>', 'mint', 'server'],
    ['server', 503, { code: 'network' }, 'mint', 'server'],
    ['unknown code', 418, { code: 'nope' }, 'mint', 'server'],
  ];

  it.each(rows)('%s: %i %j on %s is %s', async (_what, status, body, which, expected) => {
    const { f, p } = await world();
    f.fail(send(body, status));
    expect(await codeOf(call(p, which))).toBe(expected);
  });

  it('a rejection is network', async () => {
    const { f, p } = await world();
    f.fail('reject');
    expect(await codeOf(call(p, 'mint'))).toBe('network');
  });

  it('a 200 {} on mint is server; a 200 with a code on confirm resolves', async () => {
    const { f, p } = await world();
    f.fail(send({}, 200));
    expect(await codeOf(call(p, 'mint'))).toBe('server');
    f.fail(send({ code: 'forbidden', message: 'x' }, 200));
    await expect(call(p, 'confirm')).resolves.toBeUndefined();
  });
});

describe('medusaDisplaySignalling behaviour (#1219)', () => {
  it('device_refused is one request and no registration', async () => {
    const f = setup();
    const p = await paired(f);
    const before = f.requests.length;
    expect(await codeOf(s.mint(p.a, { deviceId: p.device.deviceId, deviceKey: 'wrong-key-' + 'k'.repeat(20) }))).toBe('device_refused');
    const sent = f.requests.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent.some((r) => pathOf(r) === '/tally/v1/display-devices')).toBe(false);
  });

  it('ctx.fetch is resolved per request; global fetch untouched', async () => {
    const f = setup();
    const p = await paired(f);
    const global = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('global fetch used'); });
    await s.mint(p.a, p.device);
    await s.readSnapshot(p.d, p.token);
    expect(global).toHaveBeenCalledTimes(0);
    const before = f.requests.length;
    const second = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ code: '123456', expiresAt: '2026-11-11T09:10:00.000Z' }), { status: 200 }));
    await expect(s.mint({ ...p.a, fetch: second }, p.device)).resolves.toStrictEqual({ code: '123456', expiresAt: '2026-11-11T09:10:00.000Z' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(f.requests.length).toBe(before);
    expect(global).toHaveBeenCalledTimes(0);
  });

  it("passes core's advertisement shape through untranslated (#1219 M1)", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchReturning = (body: unknown) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    const current = await readCapabilities('https://medusa.test', {}, {
      fetch: fetchReturning({ contracts: { 'order.create': [1] }, customerDisplay: { v: 1, iceServers: [], snapshot: 1 } }),
    });
    expect(current?.customerDisplay).toStrictEqual({ iceServers: [], snapshot: true });
    const old = await readCapabilities('https://medusa.test', {}, {
      fetch: fetchReturning({ contracts: { 'order.create': [1] }, customerDisplay: { iceServers: [], snapshot: true } }),
    });
    expect(old?.customerDisplay).toBeUndefined();
  });

  it('wiring', () => {
    expect(exported).toBe(s);
    expect(createMedusaAdminUserConnector().displaySignalling).toBe(s);
    expect(createMedusaConnector().displaySignalling).toBeUndefined();
  });

  it('an expired Medusa session reads as forbidden (#1219 M5)', async () => {
    const f = setup();
    const p = await paired(f);
    const expired: SyncContext = { ...p.a, headers: { Authorization: 'Bearer expired-session' } };
    for (const run of [() => s.mint(expired, p.device), () => s.list(expired, p.device)]) {
      const before = f.requests.length;
      const error = await refusal(run());
      expect([error.code, error.message]).toEqual(['forbidden', 'forbidden']);
      expect(f.requests.length).toBe(before + 1);
    }
  });

  it('the snapshot body is { snapshot } and the cap is on the snapshot alone (#1219 M3)', async () => {
    const f = setup();
    const p = await paired(f);
    const before = f.requests.length;
    await s.postSnapshot(p.a, p.device, p.displayId, { seq: 1 });
    const sent = f.requests.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('PUT');
    expect(sent[0]!.url).toBe(`${BASE}/displays/${encodeURIComponent(p.displayId)}/snapshot`);
    expect(sent[0]!.headers['content-type']).toBe('application/json');
    expect(sent[0]!.body).toBe(JSON.stringify({ snapshot: { seq: 1 } }));
    expect(await s.readSnapshot(p.d, p.token)).toStrictEqual({ seq: 1 });
    await expect(s.postSnapshot(p.a, p.device, p.displayId, { pad: 'x'.repeat(204_790) })).resolves.toBeUndefined();
    expect(await codeOf(s.postSnapshot(p.a, p.device, p.displayId, { pad: 'x'.repeat(204_791) }))).toBe('too_large');
  });

  it('the claim token travels in the body only (#1219 M4)', async () => {
    const f = setup();
    const p = await paired(f);
    const withToken = (await s.mint(p.a, p.device)).code;
    await s.claim(p.d, { code: withToken, displayName: 'Moved', token: p.token });
    const first = f.requests.at(-1)!;
    expect(JSON.parse(first.body)).toStrictEqual({ code: withToken, displayName: 'Moved', token: p.token });
    expect(first.headers).not.toHaveProperty('x-tally-display-token');
    const without = (await s.mint(p.a, p.device)).code;
    await s.claim(f.h.display('192.0.2.9'), { code: without, displayName: 'Fresh' });
    const second = f.requests.at(-1)!;
    expect(JSON.parse(second.body)).toStrictEqual({ code: without, displayName: 'Fresh' });
    expect(second.headers).not.toHaveProperty('x-tally-display-token');
  });
});

describe('request building (#1253 follow-up)', () => {
  /** Runs `call` against a paired display; checks the refusal is `code`, sent nothing, logged nothing and names no `secret`. */
  async function refusedUnsent(
    code: DisplaySignallingErrorCode, secret: string | undefined,
    call: (p: Awaited<ReturnType<typeof paired>>) => Promise<unknown>,
  ): Promise<void> {
    const spies = CONSOLE.map((name) => vi.spyOn(console, name).mockImplementation(() => {}));
    const f = setup();
    const p = await paired(f);
    const before = f.requests.length;
    const error = await refusal(call(p));
    expect(error.code).toBe(code);
    expect(error.message).toBe(error.code);
    expect(error.cause).toBeUndefined();
    expect(f.requests.length).toBe(before);
    if (secret !== undefined) {
      const own = error as unknown as Record<string, unknown>;
      const texts = [String(error), error.stack ?? '', JSON.stringify(Object.getOwnPropertyNames(error).map((k) => own[k]))];
      for (const text of texts) expect(text).not.toContain(secret);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  }

  it('R1 a ctx header Headers refuses is network, sends nothing and names no secret', () =>
    refusedUnsent('network', 'cret-session', (p) => s.mint({ ...p.a, headers: { Authorization: 'Bearer se\ncret-session' } }, p.device)));

  it('R2 a device key Headers refuses is network, sends nothing and names no secret', () =>
    refusedUnsent('network', 'key-secret', (p) => s.list(p.a, { deviceId: p.device.deviceId, deviceKey: 'dev\r\nkey-secret' })));

  it('R3 a display token Headers refuses is network, sends nothing and names no secret', () =>
    refusedUnsent('network', 'token-secret', (p) => s.readSnapshot(p.d, 'tok\u0000token-secret')));

  it('R4 a snapshot JSON cannot serialise is too_large and sends nothing', () =>
    refusedUnsent('too_large', undefined, (p) => s.postSnapshot(p.a, p.device, p.displayId, { n: 1n })));

  it('R5 a circular snapshot is too_large and sends nothing', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    return refusedUnsent('too_large', undefined, (p) => s.postSnapshot(p.a, p.device, p.displayId, circular));
  });
});
