import { MICROS_PER_MINOR } from '../tax/exact';
import type { ChargeLine, Order } from './types';

export function patchSale(order: Order, patch: Partial<Order>): Order {
  return { ...order, ...patch, ...(order.exemptedFrom ? { exemptedFrom: { ...order.exemptedFrom, ...patch } } : {}) };
}

export function exemptOrder(taxed: Order, ownRows: ReadonlyMap<string, number>): Order {
  const woo = taxed.taxRounding?.granularity === 'woocommerce';
  const taxLines = (code?: string) => woo ? [] : [{ ...(code !== undefined ? { code } : {}), ratePpm: 0, taxMicros: '0' }];
  const lineItems = taxed.lineItems.map(line => ({ ...line, taxMicros: '0',
    taxLines: taxLines(line.taxFromClass ? line.taxLines[0]?.code : undefined),
    ...(line.totalMinor !== undefined && !line.priceTaxModeConverted ? { totalMinor: line.netMinor } : {}) }));
  const charge = <C extends ChargeLine>(item: C) => {
    const amountMinor = ownRows.get(item.id)!;
    return { ...item, amountMinor, netMinor: amountMinor, taxMicros: '0', taxLines: taxLines(item.taxLines[0]?.code),
      ...(item.amountIncludesTax !== undefined ? { amountIncludesTax: taxed.pricesIncludeTax } : {}),
      ...(woo ? { totalMinor: amountMinor, netMicros: String(BigInt(amountMinor) * MICROS_PER_MINOR) } : {}) };
  };
  const fees = taxed.fees?.map(charge), shipping = taxed.shipping?.map(charge);
  const coupons = taxed.coupons?.map(coupon => ({ ...coupon, discountTaxMinor: 0,
    ...(coupon.lines ? { lines: coupon.lines.map(line => ({ ...line, discountTaxMinor: 0 })) } : {}) }));
  const lines = taxed.display.lines.map(row => ({ ...row, amountMinor: ownRows.get(row.lineId)! }));
  const displayCoupons = taxed.display.coupons?.map((row, index) => ({ ...row, amountMinor: coupons![index].discountMinor }));
  const subtotalMinor = lines.reduce((sum, row) => sum + row.amountMinor, 0);
  const discountMinor = lines.reduce((sum, row) => row.discounts.reduce((acc, discount) => acc + discount.amountMinor, sum), taxed.display.orderDiscountMinor)
    + (displayCoupons?.reduce((sum, row) => sum + row.amountMinor, 0) ?? 0);
  const lineNet = lineItems.some(line => line.priceTaxModeConverted) ? subtotalMinor - discountMinor
    : lineItems.reduce((sum, line) => sum + line.netMinor, 0);
  const totalMinor = [...fees ?? [], ...shipping ?? []].reduce((sum, item) => sum + item.amountMinor, lineNet)
    + (taxed.cashRoundings?.reduce((sum, entry) => sum + entry.minor, 0) ?? 0);
  const ownCharge = (row: { id: string; name: string; amountMinor: number }) => ({ ...row, amountMinor: ownRows.get(row.id)! });
  return { ...taxed, exemptedFrom: taxed, taxExempt: true, lineItems, ...(fees ? { fees } : {}), ...(shipping ? { shipping } : {}),
    ...(coupons ? { coupons } : {}), taxMinor: 0, totalMinor, balanceDueMinor: Math.max(0, totalMinor - taxed.paidMinor),
    changeDueMinor: Math.max(0, taxed.paidMinor - totalMinor), display: { ...taxed.display, lines, subtotalMinor, discountMinor, taxMinor: 0, totalMinor,
      ...(displayCoupons ? { coupons: displayCoupons } : {}), ...(fees ? { fees: taxed.display.fees!.map(ownCharge) } : {}),
      ...(shipping ? { shipping: taxed.display.shipping!.map(ownCharge) } : {}) } };
}
