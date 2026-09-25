/**
 * The till's identity and counters: one RxDB local document, `register`. Port provenance
 * (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`.
 *
 * The host is whatever carries local documents: `register_sessions`, created with
 * `registerSessionCollection` (a Tally database has no database-level local documents). WCPOS
 * keys its buckets by site UUID plus a numeric WooCommerce store id; TallyUI keys them by one
 * neutral `storeKey` the app derives (for example the connector id plus the base URL). WCPOS's
 * module-level snapshots (`getRegisterSnapshot`, `getRegisterId`, `getCurrentBoundRegisterId`)
 * are not ported: callers pass the host and read the document explicitly.
 */
import type { RxLocalDocumentMutation } from 'rxdb';
import { map } from 'rxjs';
import type { Closure } from './schemas';

export type RegisterHost = RxLocalDocumentMutation<any>;

export type RegisterCounters = {
  last_closure_number: number;
  perpetual_sales_total_minor: number;
  perpetual_refunds_total_minor: number;
  counters_started_at?: string | null;
};

/**
 * One register's counters, plus the closure being written: the draft is reserved here, in the
 * same atomic write as its number, and `applied` once its period is in the perpetual totals.
 */
export type RegisterBucket = Partial<RegisterCounters> & {
  closure_reservation?: { row: Closure; applied: boolean };
};

export interface RegisterStore {
  sale_counter: number;
  registers?: Record<string, RegisterBucket>;
  /** The register (drawer) this till is bound to in this store. */
  register_id?: string | null;
  register_name?: string | null;
}

export interface RegisterDocument {
  id: string;
  name: string;
  /** The caller's platform, for example `'ios'` or `'web'`. */
  platform: string;
  created_at: string;
  /** Keyed by `storeKey`. */
  stores: Record<string, RegisterStore>;
}

const REGISTER = 'register';

export function mintUuid(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return id;
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function readRegister(host: RegisterHost): Promise<RegisterDocument | null> {
  return ((await host.getLocal<RegisterDocument>(REGISTER))?.toJSON(true).data as RegisterDocument | undefined) ?? null;
}

/** Reads the register document, minting it on first use; concurrent callers get the same one. */
export async function ensureRegister(host: RegisterHost, platform: string): Promise<RegisterDocument> {
  const existing = await readRegister(host);
  if (existing) return existing;
  const id = mintUuid().toLowerCase();
  const data: RegisterDocument = {
    id,
    name: `Register ${id.slice(-4).toUpperCase()}`,
    platform,
    created_at: new Date().toISOString(),
    stores: {},
  };
  try {
    await host.insertLocal(REGISTER, data);
    return data;
  } catch (error) {
    const winner = await readRegister(host);
    if (winner) return winner;
    throw error;
  }
}

export function observeRegister$(host: RegisterHost) {
  return host
    .getLocal$<RegisterDocument>(REGISTER)
    .pipe(map((doc) => (doc?.toJSON(true).data as RegisterDocument | undefined) ?? null));
}

/** Applies `modify` to one store's bucket in a single atomic write; `undefined` leaves the document unchanged. */
async function modifyStore(
  host: RegisterHost,
  storeKey: string,
  modify: (store: RegisterStore | undefined) => RegisterStore | undefined,
) {
  const doc = await host.getLocal<RegisterDocument>(REGISTER);
  if (!doc) throw new Error('Register is not initialized');
  // RxDB can batch modifiers and return the same final document to each caller, so callers
  // capture their own result inside `modify`.
  await doc.incrementalModify((data) => {
    const store = modify(data.stores[storeKey]);
    return store ? { ...data, stores: { ...data.stores, [storeKey]: store } } : data;
  });
}

export function getBoundRegisterId(register: RegisterDocument | null, storeKey: string): string | null {
  return register?.stores?.[storeKey]?.register_id ?? null;
}

export async function readBoundRegister(host: RegisterHost, storeKey: string) {
  const register = await readRegister(host);
  const id = getBoundRegisterId(register, storeKey);
  return id ? { id, name: register?.stores[storeKey]?.register_name ?? '' } : null;
}

export function bindRegister(host: RegisterHost, storeKey: string, register: { id: string | null; name: string | null }) {
  return modifyStore(host, storeKey, (store) => ({
    ...(store ?? { sale_counter: 0 }),
    register_id: register.id,
    register_name: register.name,
  }));
}

export function unbindRegister(host: RegisterHost, storeKey: string) {
  return modifyStore(host, storeKey, (store) => store && { ...store, register_id: null, register_name: null });
}

export async function nextSaleCounter(host: RegisterHost, storeKey: string): Promise<number> {
  let counter = 0;
  await modifyStore(host, storeKey, (store) => {
    counter = (store?.sale_counter ?? 0) + 1;
    return { ...(store ?? {}), sale_counter: counter };
  });
  return counter;
}

function withRegister(store: RegisterStore | undefined, registerId: string, bucket: RegisterBucket): RegisterStore {
  const base = store ?? { sale_counter: 0 };
  return { ...base, registers: { ...base.registers, [registerId]: bucket } };
}

/**
 * Mints the register's next closure number. Given the closure draft, it reserves the draft with
 * its number and perpetual totals in the same atomic write, and a retry of the same draft gets the
 * same number back. A different draft is refused while an earlier one is reserved but not yet
 * applied (`closure_write_incomplete`).
 */
export async function mintClosureNumber(
  host: RegisterHost,
  storeKey: string,
  registerId: string,
  closure?: Closure,
): Promise<number> {
  let number = 0;
  await modifyStore(host, storeKey, (store) => {
    const register = store?.registers?.[registerId] ?? {};
    const reservation = register.closure_reservation;
    if (closure && reservation?.row.id === closure.id && !!reservation.row.number_retried === !!closure.number_retried) {
      number = reservation.row.number;
      return undefined;
    }
    if (closure && reservation && reservation.row.id !== closure.id && !reservation.applied) {
      throw new Error('closure_write_incomplete');
    }
    number = (register.last_closure_number ?? 0) + 1;
    // A re-mint of a closure whose period was already applied to the register must not
    // add it again: the register totals already carry it.
    const applied = closure && reservation?.row.id === closure.id && reservation.applied ? reservation.row : null;
    const sales = closure
      ? (register.perpetual_sales_total_minor ?? 0) - (applied?.period_sales_total_minor ?? 0) + closure.period_sales_total_minor
      : 0;
    const refunds = closure
      ? (register.perpetual_refunds_total_minor ?? 0) - (applied?.period_refunds_total_minor ?? 0) + closure.period_refunds_total_minor
      : 0;
    const next = closure
      ? {
          row: { ...closure, number, perpetual_sales_total_minor: sales, perpetual_refunds_total_minor: refunds },
          applied: !!applied || !!closure.number_retried,
        }
      : reservation;
    return withRegister(store, registerId, {
      ...register,
      last_closure_number: number,
      ...(next ? { closure_reservation: next } : {}),
      // An applied period follows the closure row it came from.
      ...(applied ? { perpetual_sales_total_minor: sales, perpetual_refunds_total_minor: refunds } : {}),
    });
  });
  return number;
}

/**
 * Adds a closed period to the register's perpetual totals. With `closureId`, it applies that
 * reserved closure once: the totals become the reservation's, and a repeat does nothing.
 */
export function advancePerpetual(
  host: RegisterHost,
  storeKey: string,
  registerId: string,
  period: { salesMinor: number; refundsMinor: number; closureId?: string },
) {
  return modifyStore(host, storeKey, (store) => {
    const register = store?.registers?.[registerId] ?? {};
    const reservation = register.closure_reservation;
    if (period.closureId && (!reservation || reservation.row.id !== period.closureId || reservation.applied)) {
      return undefined;
    }
    const sales = register.perpetual_sales_total_minor ?? 0;
    const refunds = register.perpetual_refunds_total_minor ?? 0;
    return withRegister(store, registerId, {
      ...register,
      ...(period.closureId && reservation ? { closure_reservation: { ...reservation, applied: true } } : {}),
      perpetual_sales_total_minor: period.closureId && reservation
        ? Math.max(sales, reservation.row.perpetual_sales_total_minor)
        : sales + period.salesMinor,
      perpetual_refunds_total_minor: period.closureId && reservation
        ? Math.max(refunds, reservation.row.perpetual_refunds_total_minor)
        : refunds + period.refundsMinor,
      counters_started_at: register.counters_started_at ?? new Date().toISOString(),
    });
  });
}
