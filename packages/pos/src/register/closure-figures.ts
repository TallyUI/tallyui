/**
 * One typed read of a closure's figures (#1261). `writeClosure` (session-store.ts) freezes them in the untyped
 * `Closure.breakdowns`, and a closure adopted from the store may lack any of them, so every reader goes through here.
 *
 * The one rule: a money or count value that is not a finite integer (absent, `null`, a string, NaN) is left out
 * (undefined), never read as 0. A missing group is an empty list. A payment method, tax rate or movement whose money
 * is not a finite integer is dropped from its list, and so is a movement without a string id. A cashier given as a
 * bare string becomes `{ id, name: id }`; a nameless one is named by its id.
 */
import type { Closure } from './schemas';

export type ClosureFigures = {
  openingFloat: { expectedMinor?: number; countedMinor?: number; varianceMinor?: number };
  paymentMethods: { id: string; name?: string; salesMinor: number; refundsMinor: number }[];
  taxRates: { key: string; name?: string; netMinor: number; taxMinor: number; grossMinor: number }[];
  movements: { id: string; type: string; amountMinor: number; reason: string; voided: boolean; createdAtGmt?: string; createdBy?: string }[];
  transactionCount?: number;
  refundCount?: number;
  cashiers: { id: string; name: string }[];
  taxRoundingMixed: boolean;
  taxIncludesStorePaid: boolean;
  varianceNote?: string;
};

type Values = Record<string, unknown>;

const integer = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : undefined);
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const record = (value: unknown) =>
  (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Values) : undefined);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const entries = (value: unknown) =>
  Object.entries(record(value) ?? {}).flatMap(([key, entry]) => {
    const values = record(entry);
    return values ? [[key, values] as const] : [];
  });
/** The keys whose value is known, so a missing figure is absent rather than present as `undefined`. */
const known = <T extends Values>(values: T) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;

export function closureFigures(closure: Pick<Closure, 'breakdowns'>): ClosureFigures {
  const b = closure.breakdowns;
  const float = record(b.opening_float) ?? {};
  const paymentMethods = entries(b.payment_methods).flatMap(([id, entry]) => {
    const salesMinor = integer(entry.sales_minor);
    const refundsMinor = integer(entry.refunds_minor);
    if (salesMinor === undefined || refundsMinor === undefined) return [];
    return [{ id, ...known({ name: text(entry.name) }), salesMinor, refundsMinor }];
  });
  const taxRates = entries(b.tax_rates).flatMap(([key, entry]) => {
    const [netMinor, taxMinor, grossMinor] = [integer(entry.net_minor), integer(entry.tax_minor), integer(entry.gross_minor)];
    if (netMinor === undefined || taxMinor === undefined || grossMinor === undefined) return [];
    return [{ key, ...known({ name: text(entry.name) }), netMinor, taxMinor, grossMinor }];
  });
  const movements = list(b.movements).flatMap((value) => {
    const m = record(value);
    const id = text(m?.id);
    const amountMinor = integer(m?.amountMinor);
    if (!m || id === undefined || amountMinor === undefined) return [];
    return [{
      id, type: text(m.type) ?? '', amountMinor, reason: text(m.reason) ?? '', voided: !!m.voided_by,
      ...known({ createdAtGmt: text(m.created_at_gmt), createdBy: text(m.created_by) }),
    }];
  });
  const cashiers = list(b.cashiers).flatMap((value) => {
    if (typeof value === 'string') return [{ id: value, name: value }];
    const c = record(value) ?? {};
    const id = text(c.id) ?? (Number.isFinite(c.id) ? String(c.id) : undefined);
    return id === undefined ? [] : [{ id, name: text(c.name) || id }];
  });
  return {
    openingFloat: known({
      expectedMinor: integer(float.expected_minor), countedMinor: integer(float.counted_minor),
      varianceMinor: integer(float.variance_minor),
    }),
    paymentMethods, taxRates, movements,
    ...known({ transactionCount: integer(b.transaction_count), refundCount: integer(b.refund_count) }),
    cashiers,
    taxRoundingMixed: b.tax_rounding_mixed === true,
    taxIncludesStorePaid: b.tax_includes_store_paid === true,
    ...known({ varianceNote: text(b.variance_note) }),
  };
}
