/**
 * The register's closure and X-report documents (ADR-032): WCPOS's receipt-template envelope, so
 * its shipped templates and renderer can be copied in later (ADR-032, backlog 48). Port
 * provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c` `closure-document.ts`.
 *
 * Neutral changes: money is a2's integer minor units on input, from `Closure`'s/`RegisterSession`'s
 * own fields AND from `breakdowns` (`writeClosure` freezes `payment_methods`, `opening_float`,
 * `movements` and `tax_rates` in the same minor-unit convention as the closure row itself — it is
 * not an opaque, already-decimal blob). `buildClosureDocument` converts every `*_minor`/`amountMinor`
 * breakdown field to the decimal strings the envelope carries with `minorToDecimal` at
 * `ClosureContext.exponent` (b1's `exportCsv` does the same); `number` is a2's `Closure.number`
 * (`printed_number`/`server_number` don't exist); `store_id` is sourced from a2's `store_key`;
 * date-fns/`@date-fns/tz` become `Intl`, following a2's `businessDayOf`; a cashier id stays a2's
 * string id (not WCPOS's numeric one).
 */
import { minorToDecimal } from './money';
import type { Closure, RegisterSession } from './schemas';

type Values = Record<string, unknown>;

export type ClosureContext = {
  store: Values;
  currency: string;
  timezone: string;
  locale: string;
  printedAt: string;
  /** Minor-unit decimal places for every money field the envelope carries. */
  exponent: number;
  formatMoney: (value: string) => string;
  i18n: Record<string, string>;
  /** Overrides an X-report's `server_expected` tender map, in minor units. */
  expected?: Record<string, number>;
  breakdowns?: Values;
};

const decimalMap = (minor: Record<string, number>, exponent: number): Record<string, string> =>
  Object.fromEntries(Object.entries(minor).map(([key, value]) => [key, minorToDecimal(value, exponent)]));

/** `writeClosure`'s frozen minor-unit breakdown money (`payment_methods`, `tax_rates`,
 * `opening_float`, `movements[].amountMinor`) → the decimal strings the envelope carries. */
function decimalizeBreakdowns(breakdowns: Values, exponent: number): Values {
  const dec = (m: unknown) => (typeof m === 'number' ? minorToDecimal(m, exponent) : m);
  const group = (key: string, pairs: [string, string][]) => {
    const source = breakdowns[key] as Record<string, Values> | undefined;
    return (
      source &&
      Object.fromEntries(
        Object.entries(source).map(([id, entry]) => [
          id,
          { ...entry, ...Object.fromEntries(pairs.map(([from, to]) => [to, dec(entry[from])])) },
        ]),
      )
    );
  };
  const openingFloat = breakdowns.opening_float as Values | undefined;
  return {
    ...breakdowns,
    ...(breakdowns.payment_methods
      ? { payment_methods: group('payment_methods', [['sales_minor', 'sales'], ['refunds_minor', 'refunds']]) }
      : {}),
    ...(breakdowns.tax_rates
      ? { tax_rates: group('tax_rates', [['net_minor', 'net'], ['tax_minor', 'tax'], ['gross_minor', 'gross']]) }
      : {}),
    ...(openingFloat
      ? {
          opening_float: {
            ...openingFloat, expected: dec(openingFloat.expected_minor), counted: dec(openingFloat.counted_minor),
            variance: dec(openingFloat.variance_minor),
          },
        }
      : {}),
    ...(breakdowns.movements
      ? { movements: (breakdowns.movements as Values[]).map((m) => ({ ...m, amount: dec(m.amountMinor) })) }
      : {}),
  };
}

// Server Receipt_Date_Formatter keys; absent dates remain empty, not today's date.
export function formatClosureDate(
  value: string | null | undefined,
  context: Pick<ClosureContext, 'timezone' | 'locale'>,
) {
  const date = value
    ? new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`)
    : null;
  const timeZone = context.timezone === 'device' ? undefined : context.timezone;
  const display = (settings: Intl.DateTimeFormatOptions) =>
    date ? new Intl.DateTimeFormat(context.locale, { timeZone, ...settings, hour12: false }).format(date) : '';
  const result: Record<string, string> = {
    datetime: display({ dateStyle: 'medium', timeStyle: 'short' }),
    date: display({ dateStyle: 'medium' }),
    time: display({ timeStyle: 'short' }),
  };
  for (const style of ['short', 'long', 'full'] as const) {
    result[`datetime_${style}`] = display({ dateStyle: style, timeStyle: style === 'short' ? 'short' : style });
    result[`date_${style}`] = display({ dateStyle: style });
  }
  const parts = date
    ? Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
          .formatToParts(date)
          .map(({ type, value: v }) => [type, v]),
      )
    : ({} as Record<string, string>);
  result.date_ymd = date ? `${parts.year}-${parts.month}-${parts.day}` : '';
  result.date_dmy = date ? `${parts.day}/${parts.month}/${parts.year}` : '';
  result.date_mdy = date ? `${parts.month}/${parts.day}/${parts.year}` : '';
  result.day = date ? parts.day : '';
  result.month = date ? parts.month : '';
  result.year = date ? parts.year : '';
  for (const style of ['short', 'long'] as const) {
    result[`weekday_${style}`] = display({ weekday: style });
    result[`month_${style}`] = display({ month: style });
  }
  return result;
}

function envelope(row: Values, context: ClosureContext, xreport = false) {
  const money = <T extends Values, K extends string>(values: T, fields: K[]) =>
    Object.assign(
      {},
      values,
      Object.fromEntries(fields.map((key) => [`${key}_display`, context.formatMoney(String(values[key] ?? ''))])),
    ) as T & Record<`${K}_display`, string>;
  const breakdowns = (row.breakdowns ?? {}) as Values;
  const labels: Values = {
    opened_by_name: '', closed_by_name: '', approved_by_name: '',
    ...Object.fromEntries(Object.entries(breakdowns).filter(([key]) => key.endsWith('_name'))),
    ...(breakdowns.labels as Values),
  };
  const rows = (key: string, fields: string[]) =>
    Object.entries((breakdowns[key] ?? {}) as Record<string, Values>).map(([entryKey, value]) =>
      money({ ...value, name: value.name ?? value.method ?? value.rate ?? entryKey }, fields),
    );
  const methods = (breakdowns.payment_methods ?? {}) as Record<string, Values>;
  const counted = (row.counted ?? {}) as Record<string, string>;
  const expected = (row.expected ?? {}) as Record<string, string>;
  const variances = (row.variance ?? {}) as Record<string, string>;
  const tenders = [...new Set([...Object.keys(counted), ...Object.keys(expected)])].map((name) => {
    const variance = variances[name] ?? '';
    const method = Object.values(methods).find((m) => m.method === name) ?? methods[name];
    return money(
      {
        name,
        label: method?.name || name.charAt(0).toUpperCase() + name.slice(1),
        expected: expected[name] ?? '', counted: counted[name] ?? '', variance,
        has_variance: Number(variance || 0) !== 0,
        variance_label:
          variance === '' ? '' : context.i18n[Number(variance) > 0 ? 'over' : Number(variance) < 0 ? 'short' : 'exact'],
        variance_absolute_display: context.formatMoney(variance.replace('-', '')),
      },
      ['expected', 'counted', 'variance'],
    );
  });
  return {
    closure: {
      has_sales:
        row.period_sales_total != null || row.period_refunds_total != null || Number(breakdowns.transaction_count) > 0,
      has_perpetual: row.perpetual_sales_total != null || row.perpetual_refunds_total != null,
      ...Object.fromEntries(
        ['payment_methods', 'tax_rates', 'movements'].map((key) => [`has_${key}`, Object.keys((breakdowns[key] as Values) ?? {}).length > 0]),
      ),
      ...money(row, ['period_sales_total', 'period_refunds_total', 'perpetual_sales_total', 'perpetual_refunds_total', 'unsynced_total']),
      opened_at_gmt: row.opened_at,
      opened_by: breakdowns.opened_by ?? null,
      closed_by: row.closed_by ?? null,
      approved_by: breakdowns.approved_by ?? null,
      closed_at_gmt: row.closed_at,
      opened_at: formatClosureDate(row.opened_at as string, context),
      closed_at: formatClosureDate(row.closed_at as string, context),
      tenders,
      breakdowns: {
        ...breakdowns,
        labels,
        payment_methods: rows('payment_methods', ['sales', 'refunds']),
        tax_rates: rows('tax_rates', ['net', 'tax', 'gross']),
        opening_float: money((breakdowns.opening_float ?? {}) as Values, ['expected', 'counted', 'variance']),
        movements: ((breakdowns.movements ?? []) as Values[]).map((m) => ({
          ...money(m, ['amount']),
          created_at: formatClosureDate((m.created_at_gmt ?? m.created_at) as string, context),
          type_label: context.i18n[String(m.type)] ?? m.type,
          voided: !!m.voided_by,
        })),
        cashiers: ((breakdowns.cashiers ?? []) as (Values | string)[]).map((c) => (typeof c === 'string' ? { id: c, name: c } : c)),
      },
    },
    store: context.store,
    register: { id: row.register_id, name: labels.register_name ?? '' },
    software: { name: 'WCPOS', plugin_version: row.software_version ?? '' },
    order: { currency: context.currency, printed: formatClosureDate(context.printedAt, context) },
    fiscal: {
      immutable_id: '', hash: '', qr_payload: '', tax_agency_code: '', signature_excerpt: '',
      document_label: '', sequence: null, signed_at: null, extra_fields: [],
      document_type: xreport ? 'xreport' : 'closure',
      receipt_number: xreport ? '' : String(row.number),
      is_sale_document: false, is_refund_document: false, is_closure_document: true,
      is_x_report: xreport,
      is_reprint: !xreport && !!row.print_count,
      reprint_count: xreport ? 0 : ((row.print_count as number) ?? 0),
    },
    i18n: context.i18n,
  };
}

export function buildClosureDocument(row: Closure, context: ClosureContext) {
  const { exponent } = context;
  const dec = (m: number) => minorToDecimal(m, exponent);
  const {
    store_key, till_expected, expected, counted, variance, period_sales_total_minor, period_refunds_total_minor,
    perpetual_sales_total_minor, perpetual_refunds_total_minor, unsynced_total_minor, ...rest
  } = row;
  return envelope(
    {
      ...rest,
      breakdowns: decimalizeBreakdowns(rest.breakdowns, exponent),
      store_id: store_key,
      till_expected: decimalMap(till_expected, exponent),
      expected: decimalMap(expected, exponent),
      counted: decimalMap(counted, exponent),
      variance: decimalMap(variance, exponent),
      period_sales_total: dec(period_sales_total_minor),
      period_refunds_total: dec(period_refunds_total_minor),
      perpetual_sales_total: dec(perpetual_sales_total_minor),
      perpetual_refunds_total: dec(perpetual_refunds_total_minor),
      unsynced_total: dec(unsynced_total_minor),
    },
    context,
  );
}

export function buildXReportDocument(session: RegisterSession, context: ClosureContext) {
  const { exponent } = context;
  const dec = (m: number | null | undefined) => (m == null ? undefined : minorToDecimal(m, exponent));
  const expectedMinor = context.expected ?? session.server_expected ?? {};
  const countedMinor = session.counted ?? {};
  const varianceMinor = Object.fromEntries(
    Object.entries(countedMinor).map(([key, value]) => [key, value - (expectedMinor[key] ?? 0)]),
  );
  return envelope(
    {
      id: session.id,
      register_id: session.register_id,
      store_id: session.store_key,
      opened_at: session.opened_at_gmt,
      expected: decimalMap(expectedMinor, exponent),
      counted: decimalMap(countedMinor, exponent),
      variance: decimalMap(varianceMinor, exponent),
      breakdowns: {
        ...context.breakdowns,
        opening_float: {
          expected: dec(session.expected_float_minor), counted: dec(session.counted_float_minor),
          variance: dec(session.opening_variance_minor),
        },
      },
    },
    context,
    true,
  );
}
