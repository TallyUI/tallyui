import { businessDayOf } from '../register/session-store';
import type { DayRange, ReportLine, ReportOrder, ReportRefund, StoreDay } from './types';

export interface Margin {
  costedNetMinor: number;
  costMinor: number;
  profitMinor: number;
  marginPct: number | null;
  missingLines: number;
  missingQuantity: number;
}
export interface SalesTotals {
  grossMinor: number; netMinor: number; taxMinor: number; discountMinor: number;
  refundsMinor: number; embeddedRefundsMinor: number;
  orderCount: number; averageMinor: number; items: number;
  margin: Margin;
}
export interface PaymentRow { method: string; label: string; amountMinor: number; orders: number }
export interface GroupRow { key: string; name: string; quantity: number; netMinor: number; margin: Margin }
export interface TaxRow { key: string; ratePpm: number; code?: string; label: string; taxMinor: number; netMinor: number | null }
export interface DayPoint { day: StoreDay; grossMinor: number; orderCount: number; refundsMinor: number }
export interface SalesFiguresInput {
  orders: readonly ReportOrder[];
  refunds?: readonly ReportRefund[];
  range: DayRange;
  compare?: DayRange;
  /** IANA zone of the store, or 'device'. */
  timezone: string;
}
export interface SalesFigures {
  range: DayRange;
  totals: SalesTotals;
  payments: { rows: PaymentRow[]; takenMinor: number };
  products: GroupRow[];
  categories: GroupRow[];
  taxes: TaxRow[];
  refunds: { count: number; amountMinor: number; orders: number };
  series: DayPoint[];
  comparison?: { range: DayRange; totals: SalesTotals; series: DayPoint[] };
}

export function inRange(at: string, range: DayRange, timezone: string): boolean {
  const day = businessDayOf(at, timezone);
  return range.from <= day && day <= range.to;
}

export function daysOf(range: DayRange): StoreDay[] {
  const [year, month, day] = range.from.split('-').map(Number);
  const days: StoreDay[] = [];
  for (let at = Date.UTC(year, month - 1, day); ; at += 86_400_000) {
    const next = new Date(at).toISOString().slice(0, 10);
    if (next > range.to) return days;
    days.push(next);
  }
}

export function comparisonRange(range: DayRange, mode: 'previous' | 'week'): DayRange {
  const [year, month, day] = range.from.split('-').map(Number);
  const from = Date.UTC(year, month - 1, day);
  const [toYear, toMonth, toDay] = range.to.split('-').map(Number);
  const to = Date.UTC(toYear, toMonth - 1, toDay);
  if (mode === 'previous' && day === 1 && to === Date.UTC(year, month, 0)) {
    return {
      from: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10),
      to: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10),
    };
  }
  const shift = (mode === 'week' ? 7 : daysOf(range).length) * 86_400_000;
  return { from: new Date(from - shift).toISOString().slice(0, 10), to: new Date(to - shift).toISOString().slice(0, 10) };
}

export function marginOf(lines: readonly ReportLine[]): Margin {
  const margin: Margin = { costedNetMinor: 0, costMinor: 0, profitMinor: 0, marginPct: null, missingLines: 0, missingQuantity: 0 };
  let costed = false;
  for (const line of lines) {
    if (typeof line.costMinor === 'number' && Number.isFinite(line.costMinor)) {
      costed = true;
      margin.costMinor += line.costMinor;
      margin.costedNetMinor += line.netMinor;
    } else {
      margin.missingLines += 1;
      margin.missingQuantity += Number.isFinite(line.quantity) ? Math.abs(line.quantity) : 0;
    }
  }
  margin.profitMinor = margin.costedNetMinor - margin.costMinor;
  margin.marginPct = costed && margin.costedNetMinor !== 0 ? margin.profitMinor / margin.costedNetMinor : null;
  return margin;
}

function periodFigures(input: SalesFiguresInput, range: DayRange) {
  const orders = input.orders.filter((order) => inRange(order.at, range, input.timezone));
  const refunds = (input.refunds ?? []).filter((refund) => inRange(refund.at, range, input.timezone));
  const lines = orders.flatMap((order) => order.lines);
  const totals: SalesTotals = {
    grossMinor: 0, netMinor: 0, taxMinor: 0, discountMinor: 0, refundsMinor: 0, embeddedRefundsMinor: 0,
    orderCount: orders.length, averageMinor: 0,
    items: lines.reduce((sum, line) => sum + (Number.isFinite(line.quantity) ? line.quantity : 0), 0),
    margin: marginOf(lines),
  };
  const series: DayPoint[] = daysOf(range).map((day) => ({ day, grossMinor: 0, orderCount: 0, refundsMinor: 0 }));
  const byDay = new Map(series.map((point) => [point.day, point]));
  for (const order of orders) {
    totals.grossMinor += order.totalMinor;
    totals.taxMinor += order.taxMinor;
    totals.discountMinor += order.discountMinor;
    totals.embeddedRefundsMinor += order.refunds.reduce((sum, refund) => sum + Math.abs(refund.amountMinor), 0);
    const point = byDay.get(businessDayOf(order.at, input.timezone))!;
    point.grossMinor += order.totalMinor;
    point.orderCount += 1;
  }
  for (const refund of refunds) {
    totals.refundsMinor += Math.abs(refund.amountMinor);
    byDay.get(businessDayOf(refund.at, input.timezone))!.refundsMinor += Math.abs(refund.amountMinor);
  }
  totals.netMinor = totals.grossMinor - totals.taxMinor;
  totals.averageMinor = orders.length ? Math.round(totals.grossMinor / orders.length) : 0;
  return { orders, refunds, totals, series };
}

export function salesFigures(input: SalesFiguresInput): SalesFigures {
  const { orders, refunds, totals, series } = periodFigures(input, input.range);
  const payments = new Map<string, PaymentRow>();
  const products = new Map<string, { name: string; lines: ReportLine[] }>();
  const categories = new Map<string, { name: string; lines: ReportLine[] }>();
  const taxes = new Map<string, TaxRow>();
  for (const order of orders) {
    const contributions = [...order.payments];
    const remainder = order.totalMinor - order.payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
    if (remainder > 0) contributions.push({ method: order.needsPayment ? 'unpaid' : 'unknown', amountMinor: remainder });
    const methods = new Set<string>();
    for (const payment of contributions) {
      const row = payments.get(payment.method) ?? { method: payment.method, label: '', amountMinor: 0, orders: 0 };
      row.amountMinor += payment.amountMinor;
      if (!row.label && payment.label) row.label = payment.label;
      if (!methods.has(payment.method)) row.orders += 1;
      methods.add(payment.method);
      payments.set(payment.method, row);
    }
    for (const line of order.lines) {
      const product = products.get(line.key) ?? { name: line.name, lines: [] };
      product.lines.push(line);
      products.set(line.key, product);
      const key = line.category?.id ?? '';
      const category = categories.get(key) ?? { name: line.category?.name ?? '', lines: [] };
      category.lines.push(line);
      categories.set(key, category);
    }
    for (const tax of order.taxes) {
      const key = JSON.stringify([tax.ratePpm, tax.code ?? tax.label]);
      const row = taxes.get(key) ?? { ...tax, key, taxMinor: 0, netMinor: 0 };
      row.taxMinor += tax.taxMinor;
      row.netMinor = row.netMinor === null || tax.netMinor === null ? null : row.netMinor + tax.netMinor;
      taxes.set(key, row);
    }
  }
  const groups = [products, categories].map((group) => Array.from(group, ([key, { name, lines }]): GroupRow => ({
    key, name, quantity: lines.reduce((sum, line) => sum + (Number.isFinite(line.quantity) ? line.quantity : 0), 0),
    netMinor: lines.reduce((sum, line) => sum + line.netMinor, 0), margin: marginOf(lines),
  })).sort((a, b) => b.netMinor - a.netMinor || b.quantity - a.quantity || a.name.localeCompare(b.name)));
  const rows = [...payments.values()].sort((a, b) => b.amountMinor - a.amountMinor || a.method.localeCompare(b.method));
  const result: SalesFigures = {
    range: input.range, totals,
    payments: { rows, takenMinor: rows.reduce((sum, row) => sum + (row.method === 'unpaid' ? 0 : row.amountMinor), 0) },
    products: groups[0], categories: groups[1], taxes: [...taxes.values()].sort((a, b) => b.taxMinor - a.taxMinor),
    refunds: { count: refunds.length, amountMinor: totals.refundsMinor, orders: new Set(refunds.map((refund) => refund.orderId)).size },
    series,
  };
  if (input.compare) {
    const comparison = periodFigures(input, input.compare);
    result.comparison = { range: input.compare, totals: comparison.totals, series: comparison.series };
  }
  return result;
}
