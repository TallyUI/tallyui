import { BehaviorSubject, type Observable } from 'rxjs';
import { resolvePrice, type ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';
import { taxMicros, roundMicrosToMinor } from '../tax/exact';
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

  function recalculateLine(line: LineItem): LineItem {
    const grossMinor = line.unitPriceMinor * line.quantity;

    // Recompute discount amounts from current gross
    const recalcedDiscounts = line.discounts.map((d) => ({
      ...d,
      amountMinor: computeDiscountAmount(d, grossMinor),
    }));

    const discountMinor = Math.min(grossMinor, recalcedDiscounts.reduce((sum, d) => sum + d.amountMinor, 0));
    const netMinor = grossMinor - discountMinor;
    const combinedRate = line.taxLines.reduce((sum, tax) => sum + tax.ratePpm, 0);
    const inclusiveTax = taxContext.pricesIncludeTax ? taxMicros(netMinor, combinedRate, true) : 0n;
    let allocatedTax = 0n;
    const taxLines = line.taxLines.map((tax, index) => {
      const micros = taxContext.pricesIncludeTax
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
    const netMinor = lineItems.reduce((sum, li) => sum + li.netMinor, 0);
    const lineTaxMicros = lineItems.reduce((sum, li) => sum + BigInt(li.taxMicros), 0n);
    const taxMinor = roundMicrosToMinor(lineTaxMicros);
    const subtotalMinor = taxContext.pricesIncludeTax ? netMinor - taxMinor : netMinor;
    const preOrderDiscountTotal = taxContext.pricesIncludeTax ? netMinor : subtotalMinor + taxMinor;
    let remaining = preOrderDiscountTotal;
    const recalcedOrderDiscounts = orderDiscounts.map((d) => {
      const amountMinor = computeDiscountAmount(d, d.type === 'percentage' ? subtotalMinor : remaining);
      remaining = Math.max(0, remaining - amountMinor);
      return { ...d, amountMinor };
    });
    const orderDiscountMinor = recalcedOrderDiscounts.reduce((sum, d) => sum + d.amountMinor, 0);
    const discountMinor = lineItems.reduce((sum, li) => sum + li.discountMinor, 0) + orderDiscountMinor;
    const totalMinor = Math.max(0, preOrderDiscountTotal - orderDiscountMinor);
    const paidMinor = payments.reduce((sum, p) => sum + p.amountMinor, 0);
    const balanceDueMinor = Math.max(0, totalMinor - paidMinor);
    const changeDueMinor = Math.max(0, paidMinor - totalMinor);

    return {
      id: orderId,
      status: 'draft',
      lineItems: [...lineItems],
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
    const taxRates = input.taxRates ?? [{ ratePpm: Math.round(taxContext.getTaxRate() * 1_000_000) }];

    const existing = lineItems.find(
      (li) => li.productId === productId && li.variantId === variantId
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
      netMinor: 0,
      taxMicros: '0',
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
      const unitPrice = resolvePrice(traits.getPrices(doc, { currency }), currency)?.current;
      if (!unitPrice) throw new Error('No price in ' + currency + ' for product ' + productId);
      return addLine({
        productId,
        variantId: opts?.variantId,
        name: traits.getName(doc),
        sku: traits.getSku(doc),
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
