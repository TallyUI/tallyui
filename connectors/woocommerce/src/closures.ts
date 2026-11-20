// Woo 24: the store's Z closures against WCPOS 2.0.4 (API/V2/Closures_Controller.php, Services/Closure_Store.php), ADR-093.
import { ConnectorUnauthorizedError, minorUnitDigits, type ClosureReads, type Correction, type StoreClosure, type SyncContext } from '@tallyui/core';
import { wooDecimal, wooSignedMinor } from './commands/register-transport';
import { wooStoreCurrency } from './registers';
import { throwIfUnauthorized } from './unauthorized';

type Row = Record<string, unknown>;

// Closure_Store::tenders (v2.0.4 Services/Closure_Store.php:537-551).
const TENDER_KEY = /^[a-zA-Z0-9_-]{1,191}$/;
// Closure_Store ROW times are `YYYY-MM-DD HH:MM:SS` in UTC (Closure_Store.php:37-76).
const STORE_TIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const unexpected = () => new Error('WooCommerce closures: unexpected body');

function request(context: SyncContext, path: string, body?: Record<string, unknown>): Promise<Response> {
  const init: RequestInit = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...context.headers }, body: JSON.stringify(body), signal: context.signal }
    : { method: 'GET', headers: context.headers, signal: context.signal };
  return (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/${path}`, init);
}

const errorCode = (response: Response): Promise<string | undefined> =>
  response.json().then((body) => (typeof body?.code === 'string' ? body.code : undefined), () => undefined);

function amount(value: unknown, currency: string, field: string): number {
  const minor = wooSignedMinor(value, currency);
  if (minor === undefined) throw new Error(`WooCommerce closures: bad amount ${field}`);
  return minor;
}

function tenders(value: unknown, currency: string, field: string): Record<string, number> {
  // PHP encodes an empty tender map as `[]`.
  if (Array.isArray(value) && value.length === 0) return {};
  if (!isRow(value)) throw new Error(`WooCommerce closures: bad amount ${field}`);
  return Object.fromEntries(Object.entries(value).map(([tender, text]) => [tender, amount(text, currency, `${field}.${tender}`)]));
}

const storeTime = (value: string) => value.replace(STORE_TIME, '$1T$2Z');

// Correction rows: Closure_Store::corrections_for (v2.0.4 Closure_Store.php:402-416).
function toCorrection(row: unknown, currency: string): Correction {
  if (!isRow(row) || typeof row.id !== 'number' || !isRow(row.actor) || !isRow(row.figures)) throw unexpected();
  const figures: Correction['figures'] = {};
  for (const key of ['expected_delta', 'counted', 'variance'] as const)
    if (row.figures[key] != null) figures[key] = tenders(row.figures[key], currency, key);
  for (const key of ['cash_delta', 'sales_delta', 'refunds_delta'] as const)
    if (row.figures[key] != null) figures[key] = amount(row.figures[key], currency, key);
  const approver = isRow(row.approver) ? { id: String(row.approver.id), name: String(row.approver.name) } : null;
  return {
    id: row.id, type: row.type as Correction['type'], created_at: row.created_at as string,
    actor: { id: String(row.actor.id), name: String(row.actor.name) }, approver, reason: row.reason as string, figures,
  };
}

// Closure rows: Closure_Store ROW and INTEGERS (v2.0.4 Closure_Store.php:37-79). visible() (Closures_Controller.php:109-121)
// removes the figures a blind cashier may not see, so an absent or null key leaves its field absent, never 0.
function toClosure(row: unknown, currency: string): StoreClosure {
  if (!isRow(row) || typeof row.id !== 'string' || typeof row.register_id !== 'string' || typeof row.session_id !== 'string'
    || typeof row.number !== 'number' || typeof row.opened_at_gmt !== 'string' || typeof row.closed_at_gmt !== 'string') throw unexpected();
  const closure: StoreClosure = {
    id: row.id, number: row.number, registerId: row.register_id, sessionId: row.session_id,
    reason: typeof row.reason === 'string' ? row.reason : 'end_of_day',
    openedAt: storeTime(row.opened_at_gmt), closedAt: storeTime(row.closed_at_gmt),
    printCount: typeof row.print_count === 'number' ? row.print_count : 0,
    unsyncedCount: typeof row.unsynced_count === 'number' ? row.unsynced_count : 0,
  };
  const map = (key: string) => (row[key] == null ? undefined : tenders(row[key], currency, key));
  const total = (key: string) => (row[key] == null ? undefined : amount(row[key], currency, key));
  const optional: Partial<StoreClosure> = {
    storeId: typeof row.store_id === 'number' ? String(row.store_id) : undefined,
    businessDay: typeof row.business_day === 'string' ? row.business_day : undefined,
    printedAt: typeof row.printed_at_gmt === 'string' ? storeTime(row.printed_at_gmt) : undefined,
    lastPrintedAt: typeof row.last_printed_at_gmt === 'string' ? storeTime(row.last_printed_at_gmt) : undefined,
    expected: map('expected'), tillExpected: map('till_expected'), counted: map('counted'), variance: map('variance'),
    periodSalesTotalMinor: total('period_sales_total'), periodRefundsTotalMinor: total('period_refunds_total'),
    perpetualSalesTotalMinor: total('perpetual_sales_total'), perpetualRefundsTotalMinor: total('perpetual_refunds_total'),
    unsyncedTotalMinor: total('unsynced_total'),
    correctionsCount: typeof row.corrections_count === 'number' ? row.corrections_count : undefined,
    corrections: Array.isArray(row.corrections) ? row.corrections.map((correction) => toCorrection(correction, currency)) : undefined,
  };
  for (const [key, value] of Object.entries(optional)) if (value !== undefined) Object.assign(closure, { [key]: value });
  return closure;
}

/** A closures read: the parsed body, or `null` for a 404. */
async function read(context: SyncContext, path: string): Promise<unknown> {
  const response = await request(context, path);
  // Reads need view_woocommerce_pos_reports (Closures_Controller.php:79-81).
  throwIfUnauthorized(response, 'closures');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`WooCommerce closures: HTTP ${response.status}`);
  return response.json().catch(() => { throw unexpected(); });
}

async function getClosure(context: SyncContext, id: string, currency: string): Promise<StoreClosure | null> {
  const body = await read(context, `closures/${encodeURIComponent(id)}`);
  return body === null ? null : toClosure(body, currency);
}

export const wooClosures: ClosureReads = {
  async list(context, query = {}) {
    const currency = await wooStoreCurrency(context);
    // per_page defaults to 50 and anything above 100 is a 400 (list_args :381, Closure_Store.php:23).
    const perPage = Math.min(query.perPage ?? 50, 100);
    const params = new URLSearchParams();
    if (query.registerId !== undefined) params.set('register_id', query.registerId);
    if (query.after !== undefined) params.set('after', query.after);
    if (query.before !== undefined) params.set('before', query.before);
    if (query.page !== undefined) params.set('page', String(query.page));
    params.set('per_page', String(perPage));
    // Below 2.0 the store has no closures route (404).
    const body = await read(context, `closures?${params}`);
    if (body === null) return { items: [], hasMore: false };
    if (!Array.isArray(body)) throw unexpected();
    // The list sends no paging header (Closures_Controller.php:209), so a full page means there may be more.
    return { items: body.map((row) => toClosure(row, currency)), hasMore: body.length === perPage };
  },

  async get(context, id) {
    // Only GET closures/{id} carries `corrections` (Closures_Controller.php:173-175).
    return getClosure(context, id, await wooStoreCurrency(context));
  },

  async last(context, registerId) {
    const currency = await wooStoreCurrency(context);
    // Needs register_id; with no closure the store answers 200 with `null` (Closures_Controller.php:187-207).
    const body = await read(context, `closures/last?${new URLSearchParams({ register_id: registerId })}`);
    return body === null ? null : toClosure(body, currency);
  },

  async recount(context, id, input) {
    const { correctionId, counted, reason, approval } = input;
    // The store needs `cash` and unsigned decimals under tender keys (Closure_Store::tenders, :537-551).
    if (!Object.hasOwn(counted, 'cash')
      || !Object.entries(counted).every(([tender, minor]) => TENDER_KEY.test(tender) && Number.isInteger(minor) && minor >= 0)) {
      throw new Error('WooCommerce closure recount: invalid counted');
    }
    const currency = await wooStoreCurrency(context);
    const digits = minorUnitDigits(currency);
    const response = await request(context, `closures/${encodeURIComponent(id)}/recount`, {
      id: correctionId,
      counted: Object.fromEntries(Object.entries(counted).map(([tender, minor]) => [tender, wooDecimal(minor, digits)])),
      reason,
      ...(approval ? { approval: { username: approval.username, password: approval.password } } : {}),
    });
    if (response.status === 200 || response.status === 201) {
      // The POST answers with the fiscal record, not the closure (Closure_Store.php:1010-1048), so read the closure back.
      // A retry with the same correctionId is safe: the fiscal table is UNIQUE(type, source_id) (Fiscal_Record_Store.php:89).
      try {
        const closure = await getClosure(context, id, currency);
        return closure ? { closure } : { refused: 'not_found' };
      } catch (error) {
        // The recount stands; this user may not read closures (Closures_Controller.php:79-81).
        if (error instanceof ConnectorUnauthorizedError && error.status === 403) return {};
        throw error;
      }
    }
    const code = await errorCode(response);
    // Refusals: permissions_check (:72-76, :92) and the approval check in dispatch (:137-146).
    if (response.status === 403 && code === 'rest_forbidden' && !approval) return { refused: 'approval_required' };
    if (response.status === 403 && code === 'wcpos_recount_approval_invalid') return { refused: 'approval_invalid' };
    if (response.status === 403 && code === 'wcpos_recount_approval_forbidden') return { refused: 'approval_forbidden' };
    if (response.status === 404) return { refused: 'not_found' };
    throwIfUnauthorized(response, 'closure recount');
    throw new Error(`WooCommerce closure recount: HTTP ${response.status}${code ? ` ${code}` : ''}`);
  },

  async markPrinted(context, id) {
    const currency = await wooStoreCurrency(context);
    // Answers with the closure row after recording the print (Closures_Controller.php:156-165).
    const response = await request(context, `closures/${encodeURIComponent(id)}/print`, {});
    if (response.status === 200) return toClosure(await response.json().catch(() => { throw unexpected(); }), currency);
    const code = await errorCode(response);
    // A print needs manage_woocommerce_pos_cash and view_woocommerce_pos_reports (Closures_Controller.php:77-86).
    if (response.status === 403 && code === 'rest_forbidden') return { refused: 'forbidden' };
    if (response.status === 404) return { refused: 'not_found' };
    if (response.status === 401) throwIfUnauthorized(response, 'closure print');
    throw new Error(`WooCommerce closure print: HTTP ${response.status}`);
  },
};
