/**
 * The register's local collections (ADR-032): sessions, cash movements and closures. Port
 * provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`, where they are at versions 1, 0
 * and 1; each starts at version 0 here.
 *
 * All three are local only, like `pos_orders`: the app creates them and never replicates them
 * (a replicated collection must never take local writes, #53). WCPOS's outbox fields
 * (`sync_status`, attempts, next time, error) and closures' server and receipt fields are gone;
 * sending sessions to a server is registers job c.
 *
 * Money is integer minor units: WCPOS's decimal strings become `*_minor` integers (`amountMinor`
 * on a movement, matching `Movement`), and a tender map (`counted`, `expected`, `variance`, keyed
 * by method) holds integers. People (`opened_by`, `created_by`, ...) are the backend's user id
 * as a string, since not every backend's is a number.
 */
import { addRxPlugin, type JsonSchema, type RxJsonSchema } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';

type TenderMap = Record<string, number>;

export interface RegisterSession {
  id: string;
  register_id: string;
  /** The app's neutral store key (see `bindRegister`). */
  store_key?: string | null;
  status: 'open' | 'counting' | 'closed';
  /** The store's day the session opened, `yyyy-MM-dd`. */
  business_day?: string;
  opened_at_gmt: string;
  opened_by?: string | null;
  expected_float_minor?: number | null;
  counted_float_minor: number;
  opening_variance_minor?: number | null;
  counting_started_at_gmt?: string | null;
  closed_at_gmt?: string | null;
  closed_by?: string | null;
  approval_required?: boolean;
  approved_by?: string | null;
  counted?: TenderMap | null;
  closure_id?: string | null;
  /** The last local transition, kept for a server to acknowledge (job c). */
  pending_status?: string | null;
  server_status?: string | null;
  status_at?: string | null;
  approver_token?: string | null;
  /** A server's expected figures; cleared before every money action (`requireOpenSession`). */
  server_expected?: TenderMap | null;
  server_sales_count?: number | null;
}

export interface CashMovement {
  id: string;
  session_id: string;
  type: 'paid_in' | 'paid_out' | 'no_sale' | 'void';
  amountMinor: number;
  reason: string;
  created_at_gmt: string;
  created_by?: string | null;
  /** On a `void` row: the movement it reverses. */
  voids?: string | null;
  /** On a reversed movement: its `void` row. */
  voided_by?: string | null;
}

export interface Closure {
  id: string;
  session_id: string;
  register_id: string;
  store_key?: string | null;
  business_day?: string;
  closed_by?: string | null;
  corrections_count?: number;
  number: number;
  opened_at: string;
  closed_at: string;
  till_expected: TenderMap;
  expected: TenderMap;
  counted: TenderMap;
  variance: TenderMap;
  period_sales_total_minor: number;
  /** Always 0 until TallyUI has a refund model (ADR-032 amendment 1). */
  period_refunds_total_minor: number;
  perpetual_sales_total_minor: number;
  perpetual_refunds_total_minor: number;
  /** This session's orders still waiting for the outbox, and their payments' total. */
  unsynced_count: number;
  unsynced_total_minor: number;
  software_version: string;
  breakdowns: Record<string, unknown>;
  order_ids: string[];
  movement_ids: string[];
  server_closure_id?: string | null;
  printed_at?: string | null;
  print_count: number;
  number_retried?: boolean;
}

const id: JsonSchema = { type: 'string', maxLength: 36 };
const text: JsonSchema = { type: 'string' };
const nullableText: JsonSchema = { type: ['string', 'null'] };
const minor: JsonSchema = { type: 'integer' };
const nullableMinor: JsonSchema = { type: ['integer', 'null'] };
const tenders: JsonSchema = { type: 'object', additionalProperties: minor };

export const registerSessionSchema: RxJsonSchema<RegisterSession> = {
  title: 'Register sessions', version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id, register_id: id, store_key: nullableText,
    status: { type: 'string', enum: ['open', 'counting', 'closed'], maxLength: 8 },
    business_day: { type: 'string', maxLength: 10 },
    opened_at_gmt: text, opened_by: nullableText,
    expected_float_minor: nullableMinor, counted_float_minor: minor, opening_variance_minor: nullableMinor,
    counting_started_at_gmt: nullableText, closed_at_gmt: nullableText, closed_by: nullableText,
    approval_required: { type: 'boolean', default: false }, approved_by: nullableText,
    counted: { type: ['object', 'null'], additionalProperties: minor },
    closure_id: nullableText,
    pending_status: { ...nullableText, default: null },
    server_status: { ...nullableText, default: null },
    status_at: { ...nullableText, default: null },
    approver_token: { ...nullableText, default: null },
    server_expected: { type: ['object', 'null'], additionalProperties: minor, default: null },
    server_sales_count: { type: ['integer', 'null'], default: null },
  },
  required: ['id', 'register_id', 'status', 'opened_at_gmt', 'counted_float_minor'],
  indexes: [['register_id', 'status']],
};

/**
 * Create `register_sessions` with this: the register document (`register-document.ts`) is a
 * local document on this collection, since a Tally database has no database-level ones.
 */
export function registerSessionCollection() {
  // addRxPlugin ignores a plugin it already has.
  addRxPlugin(RxDBLocalDocumentsPlugin);
  return { schema: registerSessionSchema, localDocuments: true } as const;
}

export const cashMovementSchema: RxJsonSchema<CashMovement> = {
  title: 'Cash movements', version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id, session_id: id,
    type: { type: 'string', enum: ['paid_in', 'paid_out', 'no_sale', 'void'] },
    amountMinor: minor, reason: text, created_at_gmt: text, created_by: nullableText,
    voids: nullableText, voided_by: nullableText,
  },
  required: ['id', 'session_id', 'type', 'amountMinor', 'reason', 'created_at_gmt'],
  indexes: [['session_id']],
};

export const closureSchema: RxJsonSchema<Closure> = {
  title: 'Register closures', version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id, session_id: id, register_id: id, store_key: nullableText,
    business_day: { type: 'string', maxLength: 10 },
    closed_by: nullableText, corrections_count: { type: 'integer' },
    number: { type: 'integer' }, opened_at: text, closed_at: text,
    till_expected: tenders, expected: tenders, counted: tenders, variance: tenders,
    period_sales_total_minor: minor, period_refunds_total_minor: minor,
    perpetual_sales_total_minor: minor, perpetual_refunds_total_minor: minor,
    unsynced_count: { type: 'integer' }, unsynced_total_minor: minor,
    software_version: text,
    breakdowns: { type: 'object', additionalProperties: true },
    order_ids: { type: 'array', items: text },
    movement_ids: { type: 'array', items: text },
    server_closure_id: { ...nullableText, default: null },
    printed_at: { ...nullableText, default: null },
    print_count: { type: 'integer', default: 0 },
    number_retried: { type: 'boolean', default: false },
  },
  required: ['id', 'session_id', 'register_id', 'number', 'opened_at', 'closed_at', 'till_expected', 'expected',
    'counted', 'variance', 'period_sales_total_minor', 'period_refunds_total_minor', 'perpetual_sales_total_minor',
    'perpetual_refunds_total_minor', 'unsynced_count', 'unsynced_total_minor', 'software_version', 'breakdowns',
    'order_ids', 'movement_ids', 'print_count'],
  indexes: [['register_id'], ['session_id']],
};
