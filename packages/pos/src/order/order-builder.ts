import { BehaviorSubject, type Observable } from 'rxjs';
import type { ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';
import { calculateTax } from '../tax/calculate';
import type {
  Order,
  LineItem,
  Discount,
  AppliedDiscount,
  Payment,
  CustomerSummary,
} from './types';

let nextId = 0;
function uid(): string {
  return `${Date.now()}-${++nextId}`;
}

export interface OrderBuilderOptions {
  currency: string;
  taxContext: TaxContext;
  id?: string;
}

export interface OrderBuilder {
  order$: Observable<Order>;
  addProduct(doc: any, traits: ProductTraits, options?: { variantId?: string; quantity?: number }): string;
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
  const { currency, taxContext } = options;
  const orderId = options.id ?? uid();

  let lineItems: LineItem[] = [];
  let orderDiscounts: AppliedDiscount[] = [];
  let payments: Payment[] = [];
  let customer: CustomerSummary | null = null;
  let note = '';
  const now = new Date().toISOString();

  const subject = new BehaviorSubject<Order>(buildOrder());

  function recalculateLine(line: LineItem): LineItem {
    const gross = line.price * line.quantity;
    const discountAmount = line.discounts.reduce((sum, d) => sum + d.amount, 0);
    const afterDiscount = gross - discountAmount;
    const tax = calculateTax(afterDiscount, line.taxRate, taxContext.pricesIncludeTax);

    return {
      ...line,
      discountAmount,
      taxAmount: tax.taxAmount,
      lineTotal: taxContext.pricesIncludeTax ? afterDiscount : afterDiscount + tax.taxAmount,
    };
  }

  function computeDiscountAmount(discount: Discount, base: number): number {
    if (discount.type === 'percentage') {
      return Math.round((base * discount.value) / 100 * 100) / 100;
    }
    return Math.min(discount.value, base);
  }

  function buildOrder(): Order {
    const subtotalLines = lineItems.reduce((sum, li) => {
      const lineGross = li.price * li.quantity - li.discountAmount;
      if (taxContext.pricesIncludeTax) {
        const tax = calculateTax(lineGross, li.taxRate, true);
        return sum + tax.priceExclTax;
      }
      return sum + lineGross;
    }, 0);

    const subtotal = Math.round(subtotalLines * 100) / 100;

    const recalcedOrderDiscounts = orderDiscounts.map((d) => ({
      ...d,
      amount: computeDiscountAmount(d, subtotal),
    }));

    const discountTotal =
      lineItems.reduce((sum, li) => sum + li.discountAmount, 0) +
      recalcedOrderDiscounts.reduce((sum, d) => sum + d.amount, 0);

    const taxTotal = lineItems.reduce((sum, li) => sum + li.taxAmount, 0);

    const total = lineItems.reduce((sum, li) => sum + li.lineTotal, 0) -
      recalcedOrderDiscounts.reduce((sum, d) => sum + d.amount, 0);

    const roundedTotal = Math.round(total * 100) / 100;
    const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = Math.max(0, Math.round((roundedTotal - paidAmount) * 100) / 100);
    const changeDue = Math.max(0, Math.round((paidAmount - roundedTotal) * 100) / 100);

    return {
      id: orderId,
      status: 'draft',
      lineItems: [...lineItems],
      discounts: recalcedOrderDiscounts,
      payments: [...payments],
      customer,
      note,
      subtotal,
      discountTotal: Math.round(discountTotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      total: roundedTotal,
      balanceDue,
      changeDue,
      currency,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };
  }

  function emit() {
    subject.next(buildOrder());
  }

  return {
    order$: subject.asObservable(),

    addProduct(doc, traits, opts) {
      const productId = traits.getId(doc);
      const variantId = opts?.variantId;
      const quantity = opts?.quantity ?? 1;

      const existing = lineItems.find(
        (li) => li.productId === productId && li.variantId === variantId,
      );

      if (existing) {
        existing.quantity += quantity;
        lineItems = lineItems.map((li) =>
          li.id === existing.id ? recalculateLine(existing) : li,
        );
        emit();
        return existing.id;
      }

      const priceStr = traits.getPrice(doc);
      const price = priceStr ? parseFloat(priceStr) : 0;
      const taxRate = taxContext.getTaxRate();

      const lineId = uid();
      const line: LineItem = {
        id: lineId,
        productId,
        variantId,
        name: traits.getName(doc),
        sku: traits.getSku(doc) ?? '',
        imageUrl: traits.getImageUrl(doc),
        price,
        quantity,
        taxRate,
        taxAmount: 0,
        discounts: [],
        discountAmount: 0,
        lineTotal: 0,
      };

      lineItems = [...lineItems, recalculateLine(line)];
      emit();
      return lineId;
    },

    updateQuantity(lineId, quantity) {
      lineItems = lineItems.map((li) =>
        li.id === lineId ? recalculateLine({ ...li, quantity }) : li,
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
        const base = li.price * li.quantity;
        const applied: AppliedDiscount = {
          ...discount,
          id: uid(),
          amount: computeDiscountAmount(discount, base),
        };
        return recalculateLine({ ...li, discounts: [...li.discounts, applied] });
      });
      emit();
    },

    applyOrderDiscount(discount) {
      const applied: AppliedDiscount = {
        ...discount,
        id: uid(),
        amount: 0,
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
