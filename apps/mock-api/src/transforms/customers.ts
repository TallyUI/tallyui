import type { NeutralCustomer } from '../data/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert cents (integer) to a decimal string, e.g. 23560 -> "235.60". */
function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// WooCommerce
// ---------------------------------------------------------------------------

/**
 * Transform a NeutralCustomer into WooCommerce REST API customer shape.
 * Uses `billing` object, `orders_count`, and `total_spent` as a decimal string.
 */
export function toWooCustomer(customer: NeutralCustomer, wooId: number) {
  return {
    id: wooId,
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    username: customer.email.split('@')[0],
    billing: {
      first_name: customer.address.firstName,
      last_name: customer.address.lastName,
      address_1: customer.address.line1,
      address_2: customer.address.line2 ?? '',
      city: customer.address.city,
      state: customer.address.state,
      postcode: customer.address.postalCode,
      country: customer.address.country,
      email: customer.email,
      phone: customer.phone ?? '',
    },
    shipping: {
      first_name: customer.address.firstName,
      last_name: customer.address.lastName,
      address_1: customer.address.line1,
      address_2: customer.address.line2 ?? '',
      city: customer.address.city,
      state: customer.address.state,
      postcode: customer.address.postalCode,
      country: customer.address.country,
    },
    orders_count: customer.ordersCount,
    total_spent: centsToDecimal(customer.totalSpent),
    date_created_gmt: customer.createdAt,
    date_modified_gmt: customer.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Medusa
// ---------------------------------------------------------------------------

/**
 * Transform a NeutralCustomer into Medusa Admin API customer shape.
 * Uses `cus_` prefixed ID and `first_name` / `last_name`.
 */
export function toMedusaCustomer(customer: NeutralCustomer) {
  return {
    id: customer.id.replace('cust-', 'cus_'),
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
    has_account: true,
    orders: [],
    shipping_addresses: [
      {
        id: `addr_${customer.id.replace('cust-', '')}`,
        first_name: customer.address.firstName,
        last_name: customer.address.lastName,
        address_1: customer.address.line1,
        address_2: customer.address.line2 ?? '',
        city: customer.address.city,
        province: customer.address.state,
        postal_code: customer.address.postalCode,
        country_code: customer.address.country.toLowerCase(),
        phone: customer.phone,
      },
    ],
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------

/**
 * Transform a NeutralCustomer into Shopify Admin REST API customer shape.
 * Uses `addresses[]` array, `orders_count`, `total_spent` as a decimal string.
 */
export function toShopifyCustomer(customer: NeutralCustomer) {
  return {
    id: customer.id,
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
    state: 'enabled',
    verified_email: true,
    orders_count: customer.ordersCount,
    total_spent: centsToDecimal(customer.totalSpent),
    addresses: [
      {
        id: customer.id,
        first_name: customer.address.firstName,
        last_name: customer.address.lastName,
        address1: customer.address.line1,
        address2: customer.address.line2 ?? '',
        city: customer.address.city,
        province: customer.address.state,
        zip: customer.address.postalCode,
        country_code: customer.address.country,
        phone: customer.phone,
        default: true,
      },
    ],
    default_address: {
      id: customer.id,
      first_name: customer.address.firstName,
      last_name: customer.address.lastName,
      address1: customer.address.line1,
      address2: customer.address.line2 ?? '',
      city: customer.address.city,
      province: customer.address.state,
      zip: customer.address.postalCode,
      country_code: customer.address.country,
      phone: customer.phone,
      default: true,
    },
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Vendure
// ---------------------------------------------------------------------------

/**
 * Transform a NeutralCustomer into Vendure GraphQL customer shape.
 * Uses `emailAddress`, `phoneNumber`, and Vendure-style `addresses[]`.
 */
export function toVendureCustomer(customer: NeutralCustomer) {
  return {
    id: customer.id.replace('cust-', ''),
    firstName: customer.firstName,
    lastName: customer.lastName,
    emailAddress: customer.email,
    phoneNumber: customer.phone ?? '',
    addresses: [
      {
        id: `addr-${customer.id.replace('cust-', '')}`,
        fullName: `${customer.address.firstName} ${customer.address.lastName}`,
        streetLine1: customer.address.line1,
        streetLine2: customer.address.line2 ?? '',
        city: customer.address.city,
        province: customer.address.state,
        postalCode: customer.address.postalCode,
        countryCode: customer.address.country,
        phoneNumber: customer.phone ?? '',
        defaultShippingAddress: true,
        defaultBillingAddress: true,
      },
    ],
    orders: {
      items: [],
      totalItems: customer.ordersCount,
    },
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}
