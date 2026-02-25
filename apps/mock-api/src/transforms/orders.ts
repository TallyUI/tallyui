import type { NeutralOrder, NeutralAddress } from '../data/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert cents (integer) to a decimal string, e.g. 129900 -> "1299.00". */
function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// WooCommerce
// ---------------------------------------------------------------------------

const WOO_STATUS_MAP: Record<NeutralOrder['status'], string> = {
  pending: 'pending',
  processing: 'processing',
  completed: 'completed',
  refunded: 'refunded',
  cancelled: 'cancelled',
};

function toWooAddress(addr: NeutralAddress) {
  return {
    first_name: addr.firstName,
    last_name: addr.lastName,
    address_1: addr.line1,
    address_2: addr.line2 ?? '',
    city: addr.city,
    state: addr.state,
    postcode: addr.postalCode,
    country: addr.country,
  };
}

/**
 * Transform a NeutralOrder into WooCommerce REST API order shape.
 * Prices are decimal strings. Addresses use `address_1` / `postcode` / `country`.
 */
export function toWooOrder(order: NeutralOrder, wooId: number) {
  return {
    id: wooId,
    status: WOO_STATUS_MAP[order.status],
    currency: order.currency,
    total: centsToDecimal(order.total),
    subtotal: centsToDecimal(order.subtotal),
    total_tax: centsToDecimal(order.tax),
    customer_id: order.customerId ? Number(order.customerId.replace('cust-', '')) : 0,
    billing: toWooAddress(order.billingAddress),
    shipping: toWooAddress(order.shippingAddress),
    line_items: order.lineItems.map((li, idx) => ({
      id: idx + 1,
      product_id: li.productId,
      variation_id: li.variantId,
      name: li.name,
      sku: li.sku,
      quantity: li.quantity,
      subtotal: centsToDecimal(li.total),
      total: centsToDecimal(li.total),
      price: Number(centsToDecimal(li.unitPrice)),
    })),
    date_created_gmt: order.createdAt,
    date_modified_gmt: order.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Medusa
// ---------------------------------------------------------------------------

const MEDUSA_STATUS_MAP: Record<NeutralOrder['status'], string> = {
  pending: 'pending',
  processing: 'requires_action',
  completed: 'completed',
  refunded: 'refunded',
  cancelled: 'canceled',
};

const MEDUSA_FULFILLMENT_MAP: Record<NeutralOrder['status'], string> = {
  pending: 'not_fulfilled',
  processing: 'fulfilled',
  completed: 'shipped',
  refunded: 'returned',
  cancelled: 'canceled',
};

const MEDUSA_PAYMENT_MAP: Record<NeutralOrder['status'], string> = {
  pending: 'awaiting',
  processing: 'captured',
  completed: 'captured',
  refunded: 'refunded',
  cancelled: 'canceled',
};

function toMedusaAddress(addr: NeutralAddress) {
  return {
    first_name: addr.firstName,
    last_name: addr.lastName,
    address_1: addr.line1,
    address_2: addr.line2 ?? '',
    city: addr.city,
    province: addr.state,
    postal_code: addr.postalCode,
    country_code: addr.country.toLowerCase(),
  };
}

/**
 * Transform a NeutralOrder into Medusa Admin API order shape.
 * Prices are integer cents. Addresses use `postal_code` / `country_code` (lowercase).
 */
export function toMedusaOrder(order: NeutralOrder) {
  return {
    id: order.id.replace('ord-', 'order_'),
    status: MEDUSA_STATUS_MAP[order.status],
    fulfillment_status: MEDUSA_FULFILLMENT_MAP[order.status],
    payment_status: MEDUSA_PAYMENT_MAP[order.status],
    currency_code: order.currency.toLowerCase(),
    email: order.customerEmail,
    customer_id: order.customerId
      ? order.customerId.replace('cust-', 'cus_')
      : null,
    shipping_address: toMedusaAddress(order.shippingAddress),
    billing_address: toMedusaAddress(order.billingAddress),
    items: order.lineItems.map((li) => ({
      id: `item_${li.variantId}`,
      title: li.name,
      variant_id: li.variantId,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      total: li.total,
    })),
    subtotal: order.subtotal,
    tax_total: order.tax,
    total: order.total,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------

const SHOPIFY_FINANCIAL_MAP: Record<NeutralOrder['status'], string> = {
  pending: 'pending',
  processing: 'paid',
  completed: 'paid',
  refunded: 'refunded',
  cancelled: 'voided',
};

const SHOPIFY_FULFILLMENT_MAP: Record<NeutralOrder['status'], string | null> = {
  pending: null,
  processing: 'partial',
  completed: 'fulfilled',
  refunded: null,
  cancelled: null,
};

/**
 * Transform a NeutralOrder into Shopify Admin REST API order shape.
 * Prices are decimal strings. Uses `financial_status` / `fulfillment_status`.
 */
export function toShopifyOrder(order: NeutralOrder) {
  return {
    id: order.id,
    name: `#${order.id.replace('ord-', '')}`,
    email: order.customerEmail,
    financial_status: SHOPIFY_FINANCIAL_MAP[order.status],
    fulfillment_status: SHOPIFY_FULFILLMENT_MAP[order.status],
    currency: order.currency,
    total_price: centsToDecimal(order.total),
    subtotal_price: centsToDecimal(order.subtotal),
    total_tax: centsToDecimal(order.tax),
    customer: order.customerId
      ? { id: order.customerId, email: order.customerEmail }
      : null,
    billing_address: {
      first_name: order.billingAddress.firstName,
      last_name: order.billingAddress.lastName,
      address1: order.billingAddress.line1,
      address2: order.billingAddress.line2 ?? '',
      city: order.billingAddress.city,
      province: order.billingAddress.state,
      zip: order.billingAddress.postalCode,
      country_code: order.billingAddress.country,
    },
    shipping_address: {
      first_name: order.shippingAddress.firstName,
      last_name: order.shippingAddress.lastName,
      address1: order.shippingAddress.line1,
      address2: order.shippingAddress.line2 ?? '',
      city: order.shippingAddress.city,
      province: order.shippingAddress.state,
      zip: order.shippingAddress.postalCode,
      country_code: order.shippingAddress.country,
    },
    line_items: order.lineItems.map((li, idx) => ({
      id: idx + 1,
      product_id: li.productId,
      variant_id: li.variantId,
      title: li.name,
      sku: li.sku,
      quantity: li.quantity,
      price: centsToDecimal(li.unitPrice),
    })),
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Vendure
// ---------------------------------------------------------------------------

const VENDURE_STATE_MAP: Record<NeutralOrder['status'], string> = {
  pending: 'ArrangingPayment',
  processing: 'PaymentSettled',
  completed: 'Delivered',
  refunded: 'Delivered', // Vendure treats refunded orders as Delivered + separate refund
  cancelled: 'Cancelled',
};

/**
 * Transform a NeutralOrder into Vendure GraphQL order shape.
 * Prices are integer cents. Uses state machine states.
 */
export function toVendureOrder(order: NeutralOrder) {
  return {
    id: order.id.replace('ord-', ''),
    code: order.id.replace('ord-', 'ORD'),
    state: VENDURE_STATE_MAP[order.status],
    active: order.status === 'pending' || order.status === 'processing',
    currencyCode: order.currency,
    totalWithTax: order.total,
    subTotalWithTax: order.subtotal + order.tax,
    subTotal: order.subtotal,
    customer: order.customerId
      ? {
          id: order.customerId.replace('cust-', ''),
          emailAddress: order.customerEmail,
        }
      : null,
    shippingAddress: {
      fullName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
      streetLine1: order.shippingAddress.line1,
      streetLine2: order.shippingAddress.line2 ?? '',
      city: order.shippingAddress.city,
      province: order.shippingAddress.state,
      postalCode: order.shippingAddress.postalCode,
      countryCode: order.shippingAddress.country,
    },
    billingAddress: {
      fullName: `${order.billingAddress.firstName} ${order.billingAddress.lastName}`,
      streetLine1: order.billingAddress.line1,
      streetLine2: order.billingAddress.line2 ?? '',
      city: order.billingAddress.city,
      province: order.billingAddress.state,
      postalCode: order.billingAddress.postalCode,
      countryCode: order.billingAddress.country,
    },
    lines: order.lineItems.map((li) => ({
      id: li.variantId,
      productVariant: {
        id: li.variantId,
        name: li.name,
        sku: li.sku,
      },
      quantity: li.quantity,
      unitPriceWithTax: li.unitPrice,
      linePriceWithTax: li.total,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
