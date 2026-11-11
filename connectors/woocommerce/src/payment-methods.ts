import { ConnectorUnauthorizedError, defaultPaymentMethods } from '@tallyui/core';
import type { CaptureModeEntry, PaymentHardware, PaymentMethodDescriptor, PaymentRounding, SyncContext } from '@tallyui/core';

import { wooMinorFromDecimal } from './commands/transport';

// The plugin's own default `order` for a gateway without one (woocommerce-pos Descriptor_Builder.php).
const WOO_DEFAULT_ORDER = 999;

type Row = Record<string, unknown>;
/** A row that passed the shape check; open-vocabulary values pass through as the wire has them. */
type WireRow = Row & { id: string; kind: string; capture: Row & { mode: string }; capabilities: Row };

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const objectOr = (value: unknown): Row => (isObject(value) ? value : {});
const stringOr = <T>(value: unknown, fallback: T): string | T => (typeof value === 'string' ? value : fallback);
const isModeEntry = (value: unknown): value is Row & { mode: string } => isObject(value) && typeof value.mode === 'string';

function toHardware(value: unknown): PaymentHardware | null {
  if (!isObject(value)) return null;
  const discovery = value.discovery as string;
  if (Array.isArray(value.readers)) {
    return { discovery, defaultReader: (value.default_reader as string | null | undefined) ?? null, lockToDefault: value.lock_to_default === true,
      readers: value.readers.filter((reader): reader is Row => isObject(reader) && typeof reader.id === 'string')
        .map((reader) => ({ id: reader.id as string, label: reader.label as string, status: reader.status as string, default: reader.default === true })) };
  }
  if (!Array.isArray(value.transports)) return null;
  return { discovery, transports: value.transports.map(objectOr)
    .map((entry) => ({ transport: entry.transport as string, offline: entry.offline as string, tips: entry.tips as string })) };
}

function toCaptureEntry(value: Row & { mode: string }): CaptureModeEntry {
  return { mode: value.mode, provider: stringOr(value.provider, null), hardware: toHardware(value.hardware) };
}

/** Whether the row carries a money string, which needs the store currency to convert. */
function hasMoneyString(row: WireRow): boolean {
  const amount = objectOr(row.capabilities.amount), rounding = objectOr(objectOr(row.defaults).rounding);
  return typeof amount.min === 'string' || typeof amount.max === 'string' || typeof rounding.increment === 'string';
}

// Only /stores, not wooStoreSettings: that also pages through every tax rate.
async function storeCurrency(context: SyncContext): Promise<string> {
  // Any failure but a refusal is "no store currency".
  const response = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/stores`, { method: 'GET', headers: context.headers, signal: context.signal }).catch(() => undefined);
  if (response?.status === 401 || response?.status === 403) throw new ConnectorUnauthorizedError(`WooCommerce stores: HTTP ${response.status}`, response.status);
  const stores: unknown = response?.ok ? await response.json().catch(() => undefined) : undefined;
  const currency = Array.isArray(stores) ? objectOr(stores[0]).currency : undefined;
  if (typeof currency !== 'string') throw new Error('WooCommerce payment methods: no store currency');
  return currency.toUpperCase();
}

function toRounding(value: unknown, currency: string, id: string): PaymentRounding {
  if (value === null || value === undefined) return null;
  const { increment, mode } = objectOr(value);
  const incrementMinor = typeof increment === 'string' ? wooMinorFromDecimal(increment, currency) : undefined;
  if (incrementMinor === undefined || incrementMinor <= 0 || (mode !== 'nearest' && mode !== 'up' && mode !== 'down')) {
    console.warn(`WooCommerce payment method ${id}: unreadable cash rounding; the till does not round it`);
    return null;
  }
  return { incrementMinor, mode };
}

/** `undefined` when a present bound does not convert: the till cannot enforce a limit it cannot read. */
function toAmount(amount: Row, currency: string): PaymentMethodDescriptor['capabilities']['amount'] | undefined {
  const result: PaymentMethodDescriptor['capabilities']['amount'] = { partial: amount.partial === true };
  for (const [wire, key] of [['min', 'minMinor'], ['max', 'maxMinor']] as const) {
    const text = amount[wire];
    if (text === undefined) continue;
    const minor = typeof text === 'string' ? wooMinorFromDecimal(text, currency) : undefined;
    if (minor === undefined) return undefined;
    result[key] = minor;
  }
  return result;
}

function toDescriptor(row: WireRow, currency: string): PaymentMethodDescriptor | undefined {
  const caps = row.capabilities, defaults = objectOr(row.defaults);
  const amount = toAmount(objectOr(caps.amount), currency);
  if (!amount) {
    console.warn(`WooCommerce payment method ${row.id}: unreadable amount limit; dropped`);
    return undefined;
  }
  const refunds = objectOr(caps.refunds);
  return {
    id: row.id,
    title: typeof row.title === 'string' && row.title.length > 0 ? row.title : row.id,
    kind: row.kind,
    capture: { ...toCaptureEntry(row.capture),
      ...(Array.isArray(row.capture.modes) ? { modes: row.capture.modes.filter(isModeEntry).map(toCaptureEntry) } : {}) },
    capabilities: {
      amount, change: caps.change === true, void: caps.void === true,
      refunds: { via: stringOr(refunds.via, 'none'), partial: refunds.partial === true },
      tips: stringOr(caps.tips, 'none'), offline: stringOr(caps.offline, 'none'),
    },
    defaults: { rounding: toRounding(defaults.rounding, currency, row.id), openDrawer: defaults.open_drawer === true },
  };
}

/** WCPOS wcpos/v2/payment-methods (woocommerce-pos >= 2.0.0, contract 1.3) mapped to the till's payment methods; read-only. */
export async function wooPaymentMethods(context: SyncContext): Promise<PaymentMethodDescriptor[]> {
  const response = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/payment-methods`, { method: 'GET', headers: context.headers, signal: context.signal });
  // The route shipped in woocommerce-pos 2.0.0; an older plugin keeps today's two methods.
  if (response.status === 404) return defaultPaymentMethods();
  if (response.status === 401 || response.status === 403) throw new ConnectorUnauthorizedError(`WooCommerce payment methods: HTTP ${response.status}`, response.status);
  if (!response.ok) throw new Error(`WooCommerce payment methods: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!isObject(body) || !Number.isInteger(body.schema) || typeof body.contract !== 'string' || !Array.isArray(body.methods)) {
    throw new Error('WooCommerce payment methods: unexpected response');
  }
  // v2 refuses to take payments on an unknown schema until the app is updated (contract §13).
  if (body.schema !== 1) throw new Error(`WooCommerce payment methods: unsupported schema ${body.schema}`);

  const valid = body.methods.filter((row: unknown, index): row is WireRow => {
    const ok = isObject(row) && row.schema === 1 && typeof row.id === 'string' && row.id.length > 0 && typeof row.kind === 'string'
      && isModeEntry(row.capture) && isObject(row.capabilities);
    if (!ok) {
      const id = isObject(row) && typeof row.id === 'string' && row.id.length > 0 ? row.id : `at index ${index}`;
      console.warn(`WooCommerce payment method ${id}: malformed descriptor; dropped`);
    }
    return ok;
  });
  if (body.methods.length > 0 && valid.length === 0) {
    // As v2 does: a broken payload is not an empty till.
    console.warn('WooCommerce payment methods: every descriptor is malformed; offering the default methods');
    return defaultPaymentMethods();
  }

  const order = (row: WireRow) => (typeof row.order === 'number' ? row.order : WOO_DEFAULT_ORDER);
  const enabled = valid.filter((row) => row.pos_enabled === true).sort((a, b) => order(a) - order(b));
  // Without a money string nothing converts, so the empty currency is never read.
  const currency = enabled.some(hasMoneyString) ? await storeCurrency(context) : '';
  return enabled.map((row) => toDescriptor(row, currency)).filter((row): row is PaymentMethodDescriptor => row !== undefined);
}
