import { BehaviorSubject, type Observable } from 'rxjs';
import { resolvePrice, type ProductTraits, type TaxRounding } from '@tallyui/core';
import type { TaxContext } from '../tax/types';
import { taxMicros, roundMicrosToMinor, roundedTaxByRate } from '../tax/exact';
import { taxLogger } from '../tax/tax-provider';
import { allocateOrderDiscount } from './allocate-order-discount';
import { woocommerceLine, woocommerceTotals } from './woocommerce-tax';
import type {
  Order,
  LineItem,
  Discount,
  AppliedDiscount,
  Payment,
  CustomerSummary,
  AddLineInput,
  ChargeInput, ChargeLine, FeeLine, ShippingLine,
} from './types';

/** Tax contexts already warned that per_rate_group_items fell back to per_order for inclusive lines (#287). */
const perRateGroupWarned = new WeakSet<TaxContext>();

let nextId = 0;
function uid(): string {
  return `${Date.now()}-${++nextId}`;
}

function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** The settlement totals of recalculated lines; the display figures derive from them (ADR-063). */
function sumLines(lines: Pick<LineItem, 'netMinor' | 'taxMicros' | 'taxInclusive' | 'taxLines'>[], rounding?: TaxRounding): { subtotalMinor: number; taxMinor: number; totalMinor: number } {
  // per_line_items, per_rate_group_items (#287): total = Σ rounded nets + tax (order-level-tax-calculation-strategy.js:44-49, order.entity.js:88-89).
  const rounded = roundedTaxByRate(lines, rounding);
  if (rounded) return { subtotalMinor: rounded.baseMinor, taxMinor: rounded.taxMinor, totalMinor: Math.max(0, rounded.baseMinor + rounded.taxMinor) };
  const mode = rounding?.granularity === 'per_order' ? rounding.mode : undefined;
  const netMinor = lines.reduce((sum, li) => sum + li.netMinor, 0);
  const lineTaxMicros = lines.reduce((sum, li) => sum + BigInt(li.taxMicros), 0n);
  const exclusiveTaxMicros = lines.reduce((sum, li) => li.taxInclusive ? sum : sum + BigInt(li.taxMicros), 0n);
  const taxMinor = roundMicrosToMinor(lineTaxMicros, mode);
  // Each line pays in its own mode: an inclusive line its gross, an exclusive line its net plus tax.
  // The totals sum the lines as recalculated; nothing is subtracted after tax.
  const linesTotal = netMinor + roundMicrosToMinor(exclusiveTaxMicros, mode);
  return { subtotalMinor: linesTotal - taxMinor, taxMinor, totalMinor: Math.max(0, linesTotal) };
}

/** An own-mode amount on a line, in the display mode, converted on its own at the line's rates (ADR-063). */
function toDisplayMode(line: LineItem, amountMinor: number, displayInclusive: boolean): number {
  if (line.taxInclusive === displayInclusive) return amountMinor;
  const ratePpm = line.taxLines.reduce((sum, tax) => sum + tax.ratePpm, 0);
  const taxMinor = roundMicrosToMinor(taxMicros(amountMinor, ratePpm, line.taxInclusive));
  return line.taxInclusive ? amountMinor - taxMinor : amountMinor + taxMinor;
}

/**
 * The display residue's guard (ADR-063); throws when the arithmetic is wrong rather than rounded. With no converted
 * line it's exactly 0 (Σ gross = Σ net + Σ discounts). Otherwise each of the n non-zero rounded conversions is off by
 * at most half a cent, and the order-level tax rounding by at most one more, so |residue| ≤ ⌊n/2⌋ + 1.
 */
export function assertDisplayResidue(residue: number, convertedLines: number, conversions: number): void {
  const bound = convertedLines === 0 ? 0 : Math.floor(conversions / 2) + 1;
  if (Math.abs(residue) > bound) throw new Error(`Display residue ${residue} exceeds its bound of ${bound} (ADR-063)`);
}

export interface OrderBuilderOptions {
  currency: string;
  taxContext: TaxContext;
  id?: string;
}

export interface OrderBuilder {
  order$: Observable<Order>;
  addProduct(doc: any, traits: ProductTraits, options?: { variantId?: string; quantity?: number }): string;
  addLine(input: AddLineInput): string;
  addFee(input: ChargeInput): string;
  updateFee(id: string, patch: Partial<ChargeInput>): void;
  removeFee(id: string): void;
  addShipping(input: ChargeInput & { methodId?: string }): string;
  updateShipping(id: string, patch: Partial<ChargeInput & { methodId?: string }>): void;
  removeShipping(id: string): void;
  updateQuantity(lineId: string, quantity: number): void;
  /** Sets a line's unit price (a till price edit), in minor units of the order's currency and the line's own tax mode; its discounts and tax are recomputed. */
  setUnitPrice(lineId: string, amountMinor: number): void;
  removeItem(lineId: string): void;
  applyLineDiscount(lineId: string, discount: Discount): void;
  applyOrderDiscount(discount: Discount): void;
  removeDiscount(discountId: string): void;
  addPayment(payment: Omit<Payment, 'id'>): string;
  removePayment(paymentId: string): void;
  setCustomer(customer: CustomerSummary | null): void;
  setNote(note: string): void;
  clear(): void;
  getSnapshot(): Order;
}

export function createOrderBuilder(options: OrderBuilderOptions): OrderBuilder {
  const { taxContext } = options;
  const currency = options.currency.toUpperCase();
  const orderId = options.id ?? uid();
  const woo = taxContext.rounding?.granularity === 'woocommerce' && taxContext.getTaxRates ? taxContext.rounding : undefined;
  const wooLine = (amount: number, taxClass: string | undefined, inclusive: boolean, untaxed = false, shipping = false) =>
    woocommerceLine(amount, untaxed ? [] : taxContext.getTaxRates!(taxClass, { shipping }), inclusive, currency, woo!.roundAtSubtotal, taxContext.pricesIncludeTax);
  const displayAmount = (line: LineItem, amount: number) => {
    if (!woo || line.taxInclusive === taxContext.pricesIncludeTax) return toDisplayMode(line, amount, taxContext.pricesIncludeTax);
    const item = wooLine(amount, line.taxClass, line.taxInclusive, line.taxStatus === 'none');
    return taxContext.pricesIncludeTax ? item.totalMinor : item.netMinor;
  };

  let lineItems: LineItem[] = [];
  let fees: FeeLine[] = [];
  let shipping: ShippingLine[] = [];
  let orderDiscounts: AppliedDiscount[] = [];
  let payments: Payment[] = [];
  let customer: CustomerSummary | null = null;
  let note = '';
  const now = new Date().toISOString();

  const subject = new BehaviorSubject<Order>(buildOrder());

  /** Stored lines carry no order share; buildOrder recalculates each with its allocated share (ADR-062). */
  function recalculateLine(line: LineItem, orderDiscountMinor = 0): LineItem {
    const grossMinor = line.unitPriceMinor * line.quantity;

    // Each amount is what that discount actually removed, capped at what's left, matching buildOrder's order-discount path (ADR-062).
    let remaining = grossMinor;
    const recalcedDiscounts = line.discounts.map((d) => {
      const amountMinor = Math.min(remaining, computeDiscountAmount(d, d.type === 'percentage' ? grossMinor : remaining));
      remaining -= amountMinor;
      return { ...d, amountMinor };
    });

    // The order share never exceeds what the line discounts leave (allocateOrderDiscount's bound).
    const lineDiscountMinor = Math.min(grossMinor, recalcedDiscounts.reduce((sum, d) => sum + d.amountMinor, 0));
    const discountMinor = lineDiscountMinor + orderDiscountMinor;
    const netMinor = grossMinor - discountMinor;
    if (woo) return { ...line, discounts: recalcedDiscounts, discountMinor, orderDiscountMinor,
      ...wooLine(netMinor, line.taxClass, line.taxInclusive, line.taxStatus === 'none') };
    const combinedRate = line.taxLines.reduce((sum, tax) => sum + tax.ratePpm, 0);
    // Tax in the line's own mode, from its own unit price × quantity: never re-tax a rounded base.
    const inclusiveTax = line.taxInclusive ? taxMicros(netMinor, combinedRate, true) : 0n;
    let allocatedTax = 0n;
    const taxLines = line.taxLines.map((tax, index) => {
      const micros = line.taxInclusive
        ? index === line.taxLines.length - 1
          ? inclusiveTax - allocatedTax
          : combinedRate === 0 ? 0n : inclusiveTax * BigInt(tax.ratePpm) / BigInt(combinedRate)
        : taxMicros(netMinor, tax.ratePpm, false);
      allocatedTax += micros;
      return { ...tax, taxMicros: micros.toString() };
    });

    return {
      ...line,
      discounts: recalcedDiscounts,
      discountMinor,
      orderDiscountMinor,
      netMinor,
      taxLines,
      taxMicros: allocatedTax.toString(),
    };
  }

  function computeDiscountAmount(discount: Discount, base: number): number {
    // Clamped here so both line and order discounts can never go negative (a negative
    // percentage or fixed value would otherwise raise the price instead of lowering it).
    if (discount.type === 'percentage') {
      return Math.max(0, roundHalfAway(base * discount.value / 100));
    }
    if (!Number.isInteger(discount.value)) throw new RangeError('Fixed discount must be integer minor units');
    return Math.max(0, Math.min(discount.value, base));
  }

  function buildOrder(): Order {
    // Order discounts are pre-tax (ADR-062). The base is the lines' pre-order-discount amounts, each in its
    // own mode (an inclusive line's shelf amount, an exclusive line's net). A percentage discount is additive:
    // each is computed on that base, not on what an earlier order discount leaves (WCPOS `next` / WooCommerce
    // parity). A fixed discount is computed on what remains, as before. Every discount is then capped at what
    // remains, which decreases as each is applied, and the total is allocated to the lines, which are then
    // taxed on what is left.
    const lineAmounts = lineItems.map((li) => woo ? li.unitPriceMinor * li.quantity - li.discountMinor : li.netMinor);
    const base = lineAmounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
    let remaining = base;
    const recalcedOrderDiscounts = orderDiscounts.map((d) => {
      const amountMinor = Math.min(remaining, computeDiscountAmount(d, d.type === 'percentage' ? base : remaining));
      remaining -= amountMinor;
      return { ...d, amountMinor };
    });
    const shares = allocateOrderDiscount(lineAmounts, recalcedOrderDiscounts.reduce((sum, d) => sum + d.amountMinor, 0));
    const lines = lineItems.map((li, index) => recalculateLine(li, shares[index]));

    const wooTotals = woo ? woocommerceTotals(lines, fees, shipping, currency, woo.roundAtSubtotal, taxContext.pricesIncludeTax) : undefined;
    const { subtotalMinor } = wooTotals ?? sumLines(lines, taxContext.rounding);
    const charges = [...fees, ...shipping];
    const taxedLines = [...lines, ...charges.map((charge) => ({ ...charge, taxInclusive: taxContext.pricesIncludeTax,
      taxMicros: charge.taxLines.reduce((sum, tax) => sum + BigInt(tax.taxMicros), 0n).toString() }))];
    const { taxMinor, totalMinor } = wooTotals ?? sumLines(taxedLines, taxContext.rounding);
    if (taxContext.rounding?.granularity === 'per_rate_group_items' && taxedLines.some((li) => li.taxInclusive) && !perRateGroupWarned.has(taxContext)) {
      perRateGroupWarned.add(taxContext);
      taxLogger.warn('per_rate_group_items with inclusive lines: using per_order figures until the display has a rounding row (#287, #310)');
    }
    const discountMinor = lines.reduce((sum, li) => sum + li.discountMinor, 0);
    // Display figures (ADR-063): every discount the cashier entered, and each line's order share, converted on its own
    // into the display mode. A line in the display mode shows quantity × unit price; a converted line shows its
    // converted remaining (netMinor) plus its rows and share, so it's never less than them. The subtotal is derived
    // from the settlement total, so every sum is exact; the rounding residue goes to the converted lines' amounts,
    // never to a discount or an unconverted line.
    const taxInclusive = taxContext.pricesIncludeTax;
    const figures = lines.map((li) => {
      // A negative-priced (return) line shows what settlement charges for it (recalculateLine caps it at 0 today),
      // with no rows: its capped "discounts" are the negative gross cancelled, not money off.
      const returned = li.unitPriceMinor < 0;
      const discounts = returned ? [] : li.discounts.map((d) => ({
        discountId: d.id, ...(d.label !== undefined ? { label: d.label } : {}), amountMinor: displayAmount(li, d.amountMinor),
      }));
      const shareMinor = displayAmount(li, li.orderDiscountMinor);
      const remainingMinor = woo ? taxInclusive ? li.totalMinor! : li.netMinor : toDisplayMode(li, li.netMinor, taxInclusive);
      const amountMinor = !woo && li.taxInclusive === taxInclusive && !returned ? li.unitPriceMinor * li.quantity
        : discounts.reduce((sum, d) => sum + d.amountMinor, remainingMinor + shareMinor);
      return { line: { lineId: li.id, amountMinor, discounts }, shareMinor, remainingMinor, returned };
    });
    const displayLines = figures.map((f) => f.line);
    const orderDiscountDisplay = figures.reduce((sum, f) => sum + f.shareMinor, 0);
    const displayDiscount = displayLines.reduce(
      (sum, line) => line.discounts.reduce((lineSum, d) => lineSum + d.amountMinor, sum), orderDiscountDisplay);
    const chargeRows = (items: ChargeLine[]) => items.map(({ id, name, amountMinor, netMinor, totalMinor }) =>
      ({ id, name, amountMinor: woo ? taxInclusive ? totalMinor! : netMinor : amountMinor }));
    const displayFees = chargeRows(fees), displayShipping = chargeRows(shipping);
    let displaySubtotal = (taxInclusive ? totalMinor : totalMinor - taxMinor) + displayDiscount
      - [...displayFees, ...displayShipping].reduce((sum, charge) => sum + charge.amountMinor, 0);
    let residue = displaySubtotal - displayLines.reduce((sum, line) => sum + line.amountMinor, 0);
    if (woo) {
      // ADR-076: the last shipping row, else fee, else product takes either sign of residue.
      const charge = displayShipping.at(-1) ?? displayFees.at(-1);
      const last = charge ?? displayLines.at(-1);
      if (last) last.amountMinor += residue;
      if (charge) displaySubtotal -= residue;
      residue = displaySubtotal - displayLines.reduce((sum, line) => sum + line.amountMinor, 0);
    }
    const converted = lines.flatMap((li, index) => li.taxInclusive === taxInclusive ? [] : [index]);
    const conversions = converted.reduce((count, index) => count + [lines[index].netMinor, lines[index].orderDiscountMinor,
      ...lines[index].discounts.map((d) => d.amountMinor)].filter((x) => x !== 0).length, 0);
    assertDisplayResidue(residue, converted.length, conversions);
    // Largest converted remaining first (ties to the earlier line). A negative residue takes a line down to its rows
    // and share at most, then moves on: six 2-cent inclusive lines can owe −3 with no line above 2. The spill is a
    // crash guard; it never fired in a 200k-cart fuzz. Negative-priced (return) lines convert as they are and never
    // take residue; refunds get their own design.
    let left = residue;
    const takers = converted.filter((index) => !figures[index].returned);
    for (const index of takers.sort((a, b) => figures[b].remainingMinor - figures[a].remainingMinor || a - b)) {
      if (left === 0) break;
      const take = left > 0 ? left : Math.max(left, -figures[index].remainingMinor);
      displayLines[index].amountMinor += take;
      left -= take;
    }
    if (left !== 0) throw new Error(`Display residue ${left} left over with no converted line to take it (ADR-063)`);
    // Checked here, not only in tests: every figure >= 0, and no line shows less than its own rows and share (lines
    // with a non-negative gross; a return line's negative amount is its own).
    if (displayDiscount < 0) throw new Error(`Display discount ${displayDiscount} is negative (ADR-063)`);
    for (const { line, shareMinor, returned } of figures) {
      if (returned && line.discounts.length > 0) throw new Error(`Return line ${line.lineId} shows discount rows (ADR-063)`);
      if (returned || woo) continue;
      const rows = line.discounts.reduce((sum, d) => sum + d.amountMinor, 0);
      if (shareMinor < 0 || line.discounts.some((d) => d.amountMinor < 0) || line.amountMinor < rows + shareMinor) {
        throw new Error(`Display line ${line.lineId} shows ${line.amountMinor}, less than its rows ${rows} and share ${shareMinor} (ADR-063)`);
      }
    }
    const display = {
      taxInclusive, subtotalMinor: displaySubtotal, discountMinor: displayDiscount, taxMinor, totalMinor,
      lines: displayLines, orderDiscountMinor: orderDiscountDisplay,
      ...(fees.length ? { fees: displayFees } : {}),
      ...(shipping.length ? { shipping: displayShipping } : {}),
    };
    const paidMinor = payments.reduce((sum, p) => sum + p.amountMinor, 0);
    const balanceDueMinor = Math.max(0, totalMinor - paidMinor);
    const changeDueMinor = Math.max(0, paidMinor - totalMinor);

    return {
      id: orderId,
      status: 'draft',
      lineItems: lines,
      ...(fees.length ? { fees: [...fees] } : {}),
      ...(shipping.length ? { shipping: [...shipping] } : {}),
      discounts: recalcedOrderDiscounts,
      payments: [...payments],
      customer,
      note,
      subtotalMinor,
      discountMinor,
      taxMinor,
      totalMinor,
      display,
      paidMinor,
      balanceDueMinor,
      changeDueMinor,
      currency,
      pricesIncludeTax: taxContext.pricesIncludeTax,
      ...(taxContext.rounding ? { taxRounding: taxContext.rounding } : {}),
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };
  }

  function emit() {
    subject.next(buildOrder());
  }

  function recalculateCharge(id: string, input: ChargeInput, shipping = false): ChargeLine {
    if (!Number.isInteger(input.amountMinor)) throw new RangeError('Amount must be integer minor units');
    if (input.amountMinor < 0) throw new RangeError('Amount must be >= 0');
    if (!input.name.trim()) throw new RangeError('Name must not be empty');
    const taxStatus = input.taxStatus ?? 'taxable';
    if (woo) {
      const line = wooLine(input.amountMinor, input.taxClass, taxContext.pricesIncludeTax, taxStatus === 'none', shipping);
      return { id, name: input.name, amountMinor: input.amountMinor, taxClass: input.taxClass, taxStatus,
        ...line };
    }
    const code = taxContext.getTaxRateCode?.(input.taxClass);
    const line = recalculateLine({
      id, productId: id, name: input.name, sku: '', unitPriceMinor: input.amountMinor, quantity: 1,
      taxLines: [{ ...(code !== undefined ? { code } : {}),
        ratePpm: taxStatus === 'none' ? 0 : taxContext.getTaxRatePpm(input.taxClass), taxMicros: '0' }],
      discounts: [], discountMinor: 0, orderDiscountMinor: 0, netMinor: 0, taxMicros: '0',
      taxInclusive: taxContext.pricesIncludeTax,
    });
    return { id, name: input.name, amountMinor: input.amountMinor, taxClass: input.taxClass, taxStatus,
      taxLines: line.taxLines, netMinor: line.netMinor, taxMicros: line.taxMicros };
  }

  function addLine(input: AddLineInput): string {
    const { productId, variantId, unitPrice } = input;
    const quantity = input.quantity ?? 1;
    if (unitPrice.currency !== currency) throw new RangeError('Line currency must match ' + currency);
    if (!Number.isInteger(unitPrice.amount)) throw new RangeError('Price must be integer minor units');
    if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('Quantity must be an integer >= 1');
    // A rate from the tax class carries the backend's name for it when one is mapped (#287, #288).
    const code = woo || input.taxRates ? undefined : taxContext.getTaxRateCode?.(input.taxClass);
    const taxRates = woo ? wooLine(unitPrice.amount * quantity, input.taxClass, unitPrice.taxInclusive ?? taxContext.pricesIncludeTax, input.taxStatus === 'none').taxLines
      : input.taxStatus === 'none' ? [{ ...(code !== undefined ? { code } : {}), ratePpm: 0 }]
      : input.taxRates ?? [{ ...(code !== undefined ? { code } : {}), ratePpm: taxContext.getTaxRatePpm(input.taxClass) }];
    const taxInclusive = unitPrice.taxInclusive ?? taxContext.pricesIncludeTax;

    const existing = lineItems.find(
      (li) => !input.custom && !li.custom && li.productId === productId && li.variantId === variantId && li.taxInclusive === taxInclusive
        && (!woo || li.taxClass === input.taxClass && (li.taxStatus === 'none') === (input.taxStatus === 'none'))
        && li.unitPriceMinor === unitPrice.amount && li.taxLines.length === taxRates.length
        && li.taxLines.every((tax, index) => tax.code === taxRates[index].code && tax.ratePpm === taxRates[index].ratePpm),
    );

    if (existing) {
      lineItems = lineItems.map((li) =>
        li.id === existing.id ? recalculateLine({ ...li, quantity: li.quantity + quantity }) : li,
      );
      emit();
      return existing.id;
    }

    const lineId = uid();
    const line: LineItem = {
      id: lineId,
      ...((input.custom ? input.taxClass !== undefined : woo) ? { taxClass: input.taxClass } : {}),
      productId,
      ...(input.custom ? { custom: true as const } : {}),
      ...(input.taxStatus === 'none' ? { taxStatus: 'none' as const } : {}),
      variantId,
      name: input.name,
      sku: input.sku ?? '',
      imageUrl: input.imageUrl,
      unitPriceMinor: unitPrice.amount,
      quantity,
      taxLines: taxRates.map((tax) => ({ ...tax, taxMicros: '0' })),
      discounts: [],
      discountMinor: 0,
      orderDiscountMinor: 0,
      netMinor: 0,
      taxMicros: '0',
      taxInclusive,
      // TV4b derives the store-level flag with Medusa's own precedence (region
      // preference, then currency), so a disagreement should be rare. It can
      // still happen, for example when a price preference changes after the
      // settings were read. Keeping the line in its own mode means the customer
      // pays exactly the shelf price, as Medusa's checkout would.
      ...(taxInclusive !== taxContext.pricesIncludeTax
        ? { priceTaxModeConverted: taxInclusive ? 'inclusive-to-exclusive' as const : 'exclusive-to-inclusive' as const }
        : {}),
    };

    lineItems = [...lineItems, recalculateLine(line)];
    emit();
    return lineId;
  }

  return {
    order$: subject.asObservable(),
    addLine,

    addFee(input) {
      const fee = recalculateCharge(uid(), input);
      fees = [...fees, fee]; emit(); return fee.id;
    },
    updateFee(id, patch) {
      const fee = fees.find((entry) => entry.id === id);
      if (!fee) throw new Error(`Unknown fee ${id}`);
      const updated = recalculateCharge(id, { ...fee, ...patch });
      fees = fees.map((entry) => entry.id === id ? updated : entry); emit();
    },
    removeFee(id) {
      if (!fees.some((entry) => entry.id === id)) throw new Error(`Unknown fee ${id}`);
      fees = fees.filter((entry) => entry.id !== id); emit();
    },
    addShipping(input) {
      const charge = { ...recalculateCharge(uid(), input, true), methodId: input.methodId };
      shipping = [...shipping, charge]; emit(); return charge.id;
    },
    updateShipping(id, patch) {
      const charge = shipping.find((entry) => entry.id === id);
      if (!charge) throw new Error(`Unknown shipping ${id}`);
      const input = { ...charge, ...patch };
      const updated = { ...recalculateCharge(id, input, true), methodId: input.methodId };
      shipping = shipping.map((entry) => entry.id === id ? updated : entry); emit();
    },
    removeShipping(id) {
      if (!shipping.some((entry) => entry.id === id)) throw new Error(`Unknown shipping ${id}`);
      shipping = shipping.filter((entry) => entry.id !== id); emit();
    },

    addProduct(doc, traits, opts) {
      const productId = traits.getId(doc);
      if (!traits.isSellable(doc)) throw new Error("addProduct: this product isn't sold in this store's channel");
      const variant = opts?.variantId !== undefined && traits.getVariants
        ? traits.getVariants(doc, { currency }).find((variant) => variant.id === opts.variantId) : undefined;
      if (opts?.variantId !== undefined && traits.getVariants && !variant)
        throw new Error(`Unknown variant ${opts.variantId} for product ${productId}`);
      const unitPrice = resolvePrice(variant ? variant.prices : traits.getPrices(doc, { currency }), currency)?.current;
      if (!unitPrice) throw new Error('No price in ' + currency + ' for product ' + productId);
      return addLine({
        productId,
        variantId: opts?.variantId,
        name: traits.getName(doc),
        sku: variant?.sku ?? traits.getSku(doc),
        imageUrl: traits.getImageUrl(doc),
        unitPrice,
        quantity: opts?.quantity,
        taxClass: traits.getTaxClass?.(doc, opts?.variantId),
        ...(traits.getTaxStatus?.(doc, opts?.variantId) === 'none' ? { taxStatus: 'none' as const } : {}),
      });
    },

    updateQuantity(lineId, quantity) {
      if (quantity <= 0) {
        // Treat zero/negative as removal
        lineItems = lineItems.filter((li) => li.id !== lineId);
      } else {
        lineItems = lineItems.map((li) =>
          li.id === lineId ? recalculateLine({ ...li, quantity }) : li,
        );
      }
      emit();
    },

    setUnitPrice(lineId, amountMinor) {
      if (!Number.isInteger(amountMinor)) throw new RangeError('Price must be integer minor units');
      if (amountMinor < 0) throw new RangeError('Price must be >= 0');
      if (!lineItems.some((li) => li.id === lineId)) throw new Error(`Unknown line ${lineId}`);
      lineItems = lineItems.map((li) =>
        li.id === lineId ? recalculateLine({ ...li, unitPriceMinor: amountMinor }) : li,
      );
      emit();
    },

    removeItem(lineId) {
      lineItems = lineItems.filter((li) => li.id !== lineId);
      emit();
    },

    applyLineDiscount(lineId, discount) {
      lineItems = lineItems.map((li) => {
        if (li.id !== lineId) return li;
        const base = li.unitPriceMinor * li.quantity;
        const applied: AppliedDiscount = {
          ...discount,
          id: uid(),
          amountMinor: computeDiscountAmount(discount, base),
        };
        return recalculateLine({ ...li, discounts: [...li.discounts, applied] });
      });
      emit();
    },

    applyOrderDiscount(discount) {
      const applied: AppliedDiscount = {
        ...discount,
        id: uid(),
        amountMinor: computeDiscountAmount(discount, 0),
      };
      orderDiscounts = [...orderDiscounts, applied];
      emit();
    },

    removeDiscount(discountId) {
      orderDiscounts = orderDiscounts.filter((d) => d.id !== discountId);
      lineItems = lineItems.map((li) => {
        const filtered = li.discounts.filter((d) => d.id !== discountId);
        if (filtered.length !== li.discounts.length) {
          return recalculateLine({ ...li, discounts: filtered });
        }
        return li;
      });
      emit();
    },

    addPayment(payment) {
      const id = uid();
      payments = [...payments, { ...payment, id }];
      emit();
      return id;
    },

    removePayment(paymentId) {
      payments = payments.filter((p) => p.id !== paymentId);
      emit();
    },

    setCustomer(c) {
      customer = c;
      emit();
    },

    setNote(n) {
      note = n;
      emit();
    },

    clear() {
      lineItems = [];
      fees = [];
      shipping = [];
      orderDiscounts = [];
      payments = [];
      customer = null;
      note = '';
      emit();
    },

    getSnapshot() {
      return subject.getValue();
    },
  };
}
