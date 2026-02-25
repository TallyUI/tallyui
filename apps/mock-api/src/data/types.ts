export interface NeutralProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  categories: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string }>;
  images: Array<{ url: string; alt: string }>;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    compareAtPrice: number | null;
    weight: number | null;
    stockQuantity: number;
    stockStatus: 'instock' | 'outofstock' | 'onbackorder';
    trackInventory: boolean;
    options: Record<string, string>;
  }>;
  type: 'simple' | 'variable' | 'giftcard';
  createdAt: string;
  updatedAt: string;
}

export interface NeutralOrder {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'refunded' | 'cancelled';
  customerId: string | null;
  customerEmail: string;
  lineItems: Array<{
    productId: string;
    variantId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  shippingAddress: NeutralAddress;
  billingAddress: NeutralAddress;
  createdAt: string;
  updatedAt: string;
}

export interface NeutralCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: NeutralAddress;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface NeutralAddress {
  firstName: string;
  lastName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}
