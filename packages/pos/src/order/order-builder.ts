import { BehaviorSubject, type Observable } from 'rxjs';
import { resolvePrice, type ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';
import { taxMicros, roundMicrosToMinor } from '../tax/exact';
import { allocateOrderDiscount } from './allocate-order-discount';
import type {
  Order,
  LineItem,
  Discount,
  AppliedDiscount,
  Payment,
  CustomerSummary,
  AddLineInput,
} from './types';

let nextId = 0;
function uid(): string {
  return `${Date.now()}-${++nextId}`;
}

function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
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
  updateQuantity(lineId: string, quantity: number): void;
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

  let lineItems: LineItem[] = [];
  let orderDiscounts: AppliedDiscount[] = [];
  let payments: Payment[] = [];
  let customer: CustomerSummary | null = null;
  let note = '';
  const now = new Date().toISOString();

  const subject = new BehaviorSubject<Order>(buildOrder());

  /** Stored lines carry no order share; buildOrder recalculates each with its allocated share (ADR-062). */
  function recalculateLine(line: LineItem, orderDiscountMinor = 0): LineItem {
    const grossMinor = line.unitPriceMinor * line.quantity;

    // Recompute discount amounts from current gross
    const recalcedDiscounts = line.discounts.map((d) => ({
      ...d,
      amountMinor: computeDiscountAmount(d, grossMinor),
    }));

    // The order share never exceeds what the line discounts leave (allocateOrderDiscount's bound).
    const lineDiscountMinor = Math.min(grossMinor, recalcedDiscounts.reduce((sum, d) => sum + d.amountMinor, 0));
    const discountMinor = lineDiscountMinor + orderDiscountMinor;
    const netMinor = grossMinor - discountMinor;
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
    if (discount.type === 'percentage') {
      return roundHalfAway(base * discount.value / 100);
    }
    if (!Number.isInteger(discount.value)) throw new RangeError('Fixed discount must be integer minor units');
    return Math.min(discount.value, base);
  }

  function buildOrder(): Order {
    // Order discounts are pre-tax (ADR-062). The base is the lines' pre-order-discount amounts, each in its
    // own mode (an inclusive line's shelf amount, an exclusive line's net); each discount takes its part of
    // the base still remaining, and the total is allocated to the lines, which are then taxed on what is left.
    const lineAmounts = lineItems.map((li) => li.netMinor);
    let remaining = lineAmounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
    const recalcedOrderDiscounts = orderDiscounts.map((d) => {
      const amountMinor = Math.max(0, Math.min(remaining, computeDiscountAmount(d, remaining)));
      remaining -= amountMinor;
      return { ...d, amountMinor };
    });
    const shares = allocateOrderDiscount(lineAmounts, recalcedOrderDiscounts.reduce((sum, d) => sum + d.amountMinor, 0));
    const lines = lineItems.map((li, index) => recalculateLine(li, shares[index]));

    const netMinor = lines.reduce((sum, li) => sum + li.netMinor, 0);
    const lineTaxMicros = lines.reduce((sum, li) => sum + BigInt(li.taxMicros), 0n);
    const exclusiveTaxMicros = lines.reduce((sum, li) => li.taxInclusive ? sum : sum + BigInt(li.taxMicros), 0n);
    const taxMinor = roundMicrosToMinor(lineTaxMicros);
    // Each line pays in its own mode: an inclusive line its gross, an exclusive line its net plus tax.
    // The totals sum the discounted lines; nothing is subtracted after tax.
    const linesTotal = netMinor + roundMicrosToMinor(exclusiveTaxMicros);
    const subtotalMinor = linesTotal - taxMinor;
    const discountMinor = lines.reduce((sum, li) => sum + li.discountMinor, 0);
    const totalMinor = Math.max(0, linesTotal);
    const paidMinor = payments.reduce((sum, p) => sum + p.amountMinor, 0);
    const balanceDueMinor = Math.max(0, totalMinor - paidMinor);
    const changeDueMinor = Math.max(0, paidMinor - totalMinor);

    return {
      id: orderId,
      status: 'draft',
      lineItems: lines,
      discounts: recalcedOrderDiscounts,
      payments: [...payments],
      customer,
      note,
      subtotalMinor,
      discountMinor,
      taxMinor,
      totalMinor,
      paidMinor,
      balanceDueMinor,
      changeDueMinor,
      currency,
      pricesIncludeTax: taxContext.pricesIncludeTax,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };
  }

  function emit() {
    subject.next(buildOrder());
  }

  function addLine(input: AddLineInput): string {
    const { productId, variantId, unitPrice } = input;
    const quantity = input.quantity ?? 1;
    if (unitPrice.currency !== currency) throw new RangeError('Line currency must match ' + currency);
    if (!Number.isInteger(unitPrice.amount)) throw new RangeError('Price must be integer minor units');
    if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('Quantity must be an integer >= 1');
    const taxRates = input.taxRates ?? [{ ratePpm: taxContext.getTaxRatePpm() }];
    const taxInclusive = unitPrice.taxInclusive ?? taxContext.pricesIncludeTax;

    const existing = lineItems.find(
      (li) => li.productId === productId && li.variantId === variantId && li.taxInclusive === taxInclusive
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
      productId,
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
