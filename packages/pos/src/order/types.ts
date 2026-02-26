export interface Order {
  id: string;
  status: 'draft' | 'parked' | 'saved' | 'completed';
  lineItems: LineItem[];
  discounts: AppliedDiscount[];
  payments: Payment[];
  customer: CustomerSummary | null;
  note: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  balanceDue: number;
  changeDue: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  imageUrl?: string;
  price: number;
  quantity: number;
  taxRate: number;
  taxAmount: number;
  discounts: AppliedDiscount[];
  discountAmount: number;
  lineTotal: number;
}

export interface Discount {
  type: 'percentage' | 'fixed';
  value: number;
  label?: string;
  couponCode?: string;
}

export interface AppliedDiscount extends Discount {
  id: string;
  amount: number;
}

export interface Payment {
  id: string;
  method: string;
  amount: number;
  reference?: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  email?: string;
}

export interface PaymentMethod {
  id: string;
  label: string;
  icon?: string;
  requiresReference?: boolean;
}
