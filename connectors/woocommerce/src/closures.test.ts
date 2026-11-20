import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type StoreClosure, type SyncContext } from '@tallyui/core';
import { wooClosures } from './closures';
import { createWooCommerceConnector, woocommerceConnector } from './index';

const baseUrl = 'https://closures.test/wp-json/wcpos/v2';
const context: SyncContext = {
  connectorId: 'woocommerce', baseUrl, headers: { Authorization: 'Bearer closures-token', 'X-WCPOS': '1' },
};
const closureId = '7a1c0f3e-1111-4c3d-9e2f-0000000000c1';
const registerId = '0b6f8e2a-1111-4c3d-9e2f-000000000001';
const correctionId = '5d2e9b10-2222-4c3d-9e2f-0000000000f1';

type Sent = { method: string; path: string; body?: unknown };
let sent: Sent[];
let store: Record<string, unknown>;
let routes: Record<string, () => Response>;
const fetchMock = vi.fn<typeof fetch>();
const ctx = () => ({ ...context, fetch: fetchMock });

const fullRow = () => ({
  id: closureId, register_id: registerId, session_id: '9c3d4e5f-3333-4c3d-9e2f-000000000051', store_id: 2, number: 12,
  printed_number: 12, opened_at_gmt: '2026-11-20 08:00:00', business_day: '2026-11-20', closed_at_gmt: '2026-11-20 17:05:30',
  opened_by: 3, closed_by: 3, approved_by: null, reason: 'end_of_day',
  expected: { cash: '150.0000', card: '-2.5000' }, till_expected: { cash: '150.0000', card: '-2.5000' },
  counted: { cash: '149.0000', card: '0.0000' }, variance: { cash: '-1.0000', card: '2.5000' },
  period_sales_total: '300.0000', period_refunds_total: '12.5000', perpetual_sales_total: '9000.0000', perpetual_refunds_total: '400.0000',
  unsynced_count: 1, unsynced_total: '4.2500', printed_at_gmt: null, breakdowns: {}, findings: [], print_count: 1,
  last_printed_at_gmt: '2026-11-20 17:06:00', corrections_count: 1,
});
const fullClosure: StoreClosure = {
  id: closureId, number: 12, registerId, sessionId: '9c3d4e5f-3333-4c3d-9e2f-000000000051', storeId: '2', reason: 'end_of_day',
  businessDay: '2026-11-20', openedAt: '2026-11-20T08:00:00Z', closedAt: '2026-11-20T17:05:30Z', printCount: 1,
  lastPrintedAt: '2026-11-20T17:06:00Z',
  expected: { cash: 15000, card: -250 }, tillExpected: { cash: 15000, card: -250 }, counted: { cash: 14900, card: 0 },
  variance: { cash: -100, card: 250 },
  periodSalesTotalMinor: 30000, periodRefundsTotalMinor: 1250, perpetualSalesTotalMinor: 900000, perpetualRefundsTotalMinor: 40000,
  unsyncedCount: 1, unsyncedTotalMinor: 425, correctionsCount: 1,
};
// The keys visible() removes for a cashier without view_woocommerce_pos_reports (Closures_Controller.php:109-121).
const blind = (row: Record<string, unknown>) => {
  for (const key of ['expected', 'till_expected', 'variance', 'period_sales_total', 'period_refunds_total', 'perpetual_sales_total',
    'perpetual_refunds_total', 'breakdowns', 'findings']) delete row[key];
  return row;
};
const refusal = (status: number, code: string) => () => Response.json({ code, message: 'The closure request could not be completed.', data: { status } }, { status });

beforeEach(() => {
  sent = [];
  store = { id: 0, currency: 'usd' };
  routes = {};
  fetchMock.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = `${url.pathname.slice(new URL(baseUrl).pathname.length + 1)}${url.search}`;
    const method = init?.method ?? 'GET';
    sent.push({ method, path, ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}) });
    if (path === 'stores') return Response.json([store]);
    const answer = routes[`${method} ${url.pathname.slice(new URL(baseUrl).pathname.length + 1)}`];
    if (!answer) throw new Error(`Unexpected request: ${method} ${url}`);
    return answer();
  });
});

afterEach(() => { vi.restoreAllMocks(); });

const closureRequests = () => sent.filter((request) => request.path !== 'stores');

describe('wooClosures', () => {
  it('C0: both connector forms carry wooClosures', () => {
    expect(createWooCommerceConnector().closures).toBe(wooClosures);
    expect(woocommerceConnector.closures).toBe(wooClosures);
  });

  describe('C1 list', () => {
    it('maps a USD row with every field exactly', async () => {
      routes['GET closures'] = () => Response.json([fullRow()]);
      const page = await wooClosures.list(ctx());
      expect(page).toEqual({ items: [fullClosure], hasMore: false });
      expect(page.items[0]).not.toHaveProperty('printedAt');
      expect(sent[0]).toEqual({ method: 'GET', path: 'stores' });
    });

    it('sends the given filters and per_page', async () => {
      routes['GET closures'] = () => Response.json([]);
      await wooClosures.list(ctx(), { registerId, after: '2026-11-01', before: '2026-11-20', page: 3, perPage: 20 });
      const query = new URLSearchParams(closureRequests()[0].path.split('?')[1]);
      expect(Object.fromEntries(query)).toEqual({ register_id: registerId, after: '2026-11-01', before: '2026-11-20', page: '3', per_page: '20' });
      expect(fetchMock.mock.calls[1][1]).toEqual({ method: 'GET', headers: context.headers, signal: undefined });
    });

    it('sends per_page=50 by default and caps it at 100', async () => {
      routes['GET closures'] = () => Response.json([]);
      await wooClosures.list(ctx());
      await wooClosures.list(ctx(), { perPage: 500 });
      expect(closureRequests().map((request) => request.path)).toEqual(['closures?per_page=50', 'closures?per_page=100']);
    });

    it('has more only when the page came back full', async () => {
      routes['GET closures'] = () => Response.json([fullRow(), fullRow()]);
      expect((await wooClosures.list(ctx(), { perPage: 2 })).hasMore).toBe(true);
      routes['GET closures'] = () => Response.json([fullRow()]);
      expect((await wooClosures.list(ctx(), { perPage: 2 })).hasMore).toBe(false);
    });

    it('reads amounts with the store currency digits (JPY has none)', async () => {
      store.currency = 'jpy';
      routes['GET closures'] = () => Response.json([{ ...fullRow(), expected: { cash: '1500.0000' } }]);
      expect((await wooClosures.list(ctx())).items[0].expected).toEqual({ cash: 1500 });
    });

    it('returns an empty page when the store has no closures route (404)', async () => {
      routes['GET closures'] = refusal(404, 'rest_no_route');
      expect(await wooClosures.list(ctx())).toEqual({ items: [], hasMore: false });
    });
  });

  describe('C2 blind', () => {
    it('leaves the withheld figures absent, never 0', async () => {
      routes['GET closures'] = () => Response.json([blind(fullRow())]);
      const [closure] = (await wooClosures.list(ctx())).items;
      for (const field of ['expected', 'tillExpected', 'variance', 'periodSalesTotalMinor', 'periodRefundsTotalMinor',
        'perpetualSalesTotalMinor', 'perpetualRefundsTotalMinor']) expect(field in closure, field).toBe(false);
      expect(closure.counted).toEqual({ cash: 14900, card: 0 });
    });

    it('has no counted for a store_switch row without one', async () => {
      const row: Record<string, unknown> = { ...blind(fullRow()), reason: 'store_switch' };
      delete row.counted;
      routes['GET closures'] = () => Response.json([row]);
      const [closure] = (await wooClosures.list(ctx())).items;
      expect('counted' in closure).toBe(false);
      expect(closure.reason).toBe('store_switch');
    });
  });

  describe('C3 get', () => {
    const corrections = [
      { id: 41, type: 'late_sale', actor: { id: 3, name: 'Pat' }, approver: null, reason: '', created_at: '2026-11-20T18:00:00Z',
        figures: { expected_delta: { cash: '12.5000' }, sales_delta: '12.5000', refunds_delta: '0.0000' } },
      { id: 42, type: 'late_refund', actor: { id: 3, name: 'Pat' }, approver: null, reason: '', created_at: '2026-11-20T18:10:00Z',
        figures: { expected_delta: { cash: '0.0000' }, refunds_delta: '0.0000' } },
      { id: 43, type: 'late_movement', actor: { id: 3, name: 'Pat' }, approver: null, reason: 'Float top-up', created_at: '2026-11-20T18:20:00Z',
        figures: { cash_delta: '-2.5000' } },
      { id: 44, type: 'recount', actor: { id: 3, name: 'Pat' }, approver: { id: 7, name: 'Sam' }, reason: 'Found a note',
        created_at: '2026-11-20T18:30:00Z', figures: { counted: { cash: '150.0000', card: '0.0000' }, variance: { cash: '0.0000', card: '2.5000' } } },
    ];

    it('maps the closure with its four corrections', async () => {
      routes[`GET closures/${closureId}`] = () => Response.json({ ...fullRow(), corrections_count: undefined, corrections });
      const closure = await wooClosures.get(ctx(), closureId);
      expect(closure?.corrections).toEqual([
        { id: 41, type: 'late_sale', actor: { id: '3', name: 'Pat' }, approver: null, reason: '', created_at: '2026-11-20T18:00:00Z',
          figures: { expected_delta: { cash: 1250 }, sales_delta: 1250, refunds_delta: 0 } },
        { id: 42, type: 'late_refund', actor: { id: '3', name: 'Pat' }, approver: null, reason: '', created_at: '2026-11-20T18:10:00Z',
          figures: { expected_delta: { cash: 0 }, refunds_delta: 0 } },
        { id: 43, type: 'late_movement', actor: { id: '3', name: 'Pat' }, approver: null, reason: 'Float top-up', created_at: '2026-11-20T18:20:00Z',
          figures: { cash_delta: -250 } },
        { id: 44, type: 'recount', actor: { id: '3', name: 'Pat' }, approver: { id: '7', name: 'Sam' }, reason: 'Found a note',
          created_at: '2026-11-20T18:30:00Z', figures: { counted: { cash: 15000, card: 0 }, variance: { cash: 0, card: 250 } } },
      ]);
      expect(closure?.corrections?.[0].actor.id).toBe('3');
      expect(typeof closure?.corrections?.[0].id).toBe('number');
      expect(closure?.corrections?.[1].figures).not.toHaveProperty('sales_delta');
      expect(closureRequests()).toEqual([{ method: 'GET', path: `closures/${closureId}` }]);
    });

    it('returns null for a 404', async () => {
      routes[`GET closures/${closureId}`] = refusal(404, 'wcpos_closure_not_found');
      expect(await wooClosures.get(ctx(), closureId)).toBeNull();
    });

    it('rejects with ConnectorUnauthorizedError for a 403', async () => {
      routes[`GET closures/${closureId}`] = refusal(403, 'rest_forbidden');
      await expect(wooClosures.get(ctx(), closureId)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    });

    it('rejects a bad amount', async () => {
      routes[`GET closures/${closureId}`] = () => Response.json({ ...fullRow(), unsynced_total: 'lots' });
      await expect(wooClosures.get(ctx(), closureId)).rejects.toThrow('WooCommerce closures: bad amount unsynced_total');
    });
  });

  describe('C4 last', () => {
    it('sends register_id and maps the row', async () => {
      routes['GET closures/last'] = () => Response.json(fullRow());
      expect(await wooClosures.last(ctx(), registerId)).toEqual(fullClosure);
      expect(closureRequests()).toEqual([{ method: 'GET', path: `closures/last?register_id=${registerId}` }]);
    });

    it('returns null for a 200 null body', async () => {
      routes['GET closures/last'] = () => Response.json(null);
      expect(await wooClosures.last(ctx(), registerId)).toBeNull();
    });
  });

  describe('C5 recount', () => {
    const input = { correctionId, counted: { cash: 15000, card: 2000 }, reason: 'Found a note' };
    const approval = { username: 'manager-sam', password: 'hunter2-secret' };
    const recountPath = `POST closures/${closureId}/recount`;

    it('posts the recount, then reads the closure back', async () => {
      routes[recountPath] = () => Response.json({ id: 44, type: 'recount' }, { status: 201 });
      routes[`GET closures/${closureId}`] = () => Response.json(fullRow());
      expect(await wooClosures.recount(ctx(), closureId, input)).toEqual({ closure: fullClosure });
      expect(closureRequests()).toEqual([
        { method: 'POST', path: `closures/${closureId}/recount`, body: { id: correctionId, counted: { cash: '150.00', card: '20.00' }, reason: 'Found a note' } },
        { method: 'GET', path: `closures/${closureId}` },
      ]);
      expect(fetchMock.mock.calls[1][1]?.headers).toEqual({ 'Content-Type': 'application/json', ...context.headers });
    });

    it('carries the approval when given', async () => {
      routes[recountPath] = () => Response.json({ id: 44 });
      routes[`GET closures/${closureId}`] = () => Response.json(fullRow());
      await wooClosures.recount(ctx(), closureId, { ...input, approval });
      expect(closureRequests()[0].body).toEqual({ id: correctionId, counted: { cash: '150.00', card: '20.00' }, reason: 'Found a note', approval });
    });

    it.each([
      ['without cash', { card: 2000 }],
      ['with a negative value', { cash: -1 }],
      ['with a fractional value', { cash: 1.5 }],
      ['with a bad tender key', { cash: 0, 'gift card': 100 }],
    ])('rejects a counted %s and sends nothing', async (_name, counted) => {
      await expect(wooClosures.recount(ctx(), closureId, { ...input, counted })).rejects.toThrow('WooCommerce closure recount: invalid counted');
      expect(sent).toEqual([]);
    });

    it('maps rest_forbidden with no approval to approval_required', async () => {
      routes[recountPath] = refusal(403, 'rest_forbidden');
      expect(await wooClosures.recount(ctx(), closureId, input)).toEqual({ refused: 'approval_required' });
    });

    it.each([
      ['wcpos_recount_approval_invalid', 'approval_invalid'],
      ['wcpos_recount_approval_forbidden', 'approval_forbidden'],
    ])('maps %s to %s', async (code, refused) => {
      routes[recountPath] = refusal(403, code);
      expect(await wooClosures.recount(ctx(), closureId, { ...input, approval })).toEqual({ refused });
    });

    it('maps a 404 to not_found', async () => {
      routes[recountPath] = refusal(404, 'wcpos_closure_not_found');
      expect(await wooClosures.recount(ctx(), closureId, input)).toEqual({ refused: 'not_found' });
    });

    it('resolves {} when the recount stands but the closure read is forbidden', async () => {
      routes[recountPath] = () => Response.json({ id: 44 }, { status: 201 });
      routes[`GET closures/${closureId}`] = refusal(403, 'rest_forbidden');
      const result = await wooClosures.recount(ctx(), closureId, input);
      expect(result).toEqual({});
      expect('closure' in result).toBe(false);
    });

    it('rejects a 500 without the approver credentials anywhere', async () => {
      const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
      routes[recountPath] = refusal(500, 'wcpos_closure_write_failed');
      const error = await wooClosures.recount(ctx(), closureId, { ...input, approval }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('WooCommerce closure recount: HTTP 500 wcpos_closure_write_failed');
      const seen = [String(error), JSON.stringify(error), ...spies.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)))].join('\n');
      expect(seen).not.toContain(approval.username);
      expect(seen).not.toContain(approval.password);
    });
  });

  describe('C6 markPrinted', () => {
    const printPath = `POST closures/${closureId}/print`;

    it('posts the print and maps the closure', async () => {
      routes[printPath] = () => Response.json({ ...fullRow(), print_count: 2 });
      const closure = await wooClosures.markPrinted(ctx(), closureId);
      expect(closure).toEqual({ ...fullClosure, printCount: 2 });
      expect(closureRequests()).toEqual([{ method: 'POST', path: `closures/${closureId}/print`, body: {} }]);
    });

    it('maps rest_forbidden to forbidden', async () => {
      routes[printPath] = refusal(403, 'rest_forbidden');
      expect(await wooClosures.markPrinted(ctx(), closureId)).toEqual({ refused: 'forbidden' });
    });

    it('maps a 404 to not_found', async () => {
      routes[printPath] = refusal(404, 'wcpos_closure_not_found');
      expect(await wooClosures.markPrinted(ctx(), closureId)).toEqual({ refused: 'not_found' });
    });
  });
});
