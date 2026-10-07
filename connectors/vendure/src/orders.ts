import type { SyncContext } from '@tallyui/core';
import { gql } from './replication/products';

export interface VendureOrderListOptions {
  /** Offset, default 0; negative or fractional values are truncated and floored to 0. */
  skip?: number;
  /** Page size, default 25, clamped to 1..100. */
  take?: number;
  /** Vendure's DateOperators on orderPlacedAt; only these three keys are sent. */
  orderPlacedAt?: { after?: string; before?: string; between?: { start: string; end: string } };
  /** Order states, sent as `state: { in }` when non-empty. */
  state?: string[];
  /** The plugin's register id custom field, sent as `tallyRegisterId: { eq }` when non-empty. */
  tallyRegisterId?: string;
  /** The plugin's cashier custom field, sent as `tallyCashierRef: { eq }` when non-empty. */
  tallyCashierRef?: string;
  /** Lists through `customer(id) { orders }` when non-empty. */
  customerId?: string;
  /** Trimmed; when non-empty, matches order code or customer last name with `contains`. */
  search?: string;
  /** Select the vendurepos plugin's custom fields; default true. False for a server without the plugin. */
  tallyFields?: boolean;
}

export interface VendureOrderList<T> { items: T[]; totalItems: number }

export interface VendureOrderSummary {
  id: string;
  code: string;
  state: string;
  orderPlacedAt: string | null;
  updatedAt: string;
  currencyCode: string;
  totalQuantity: number;
  total: number;
  totalWithTax: number;
  customer: { id: string; firstName: string; lastName: string; emailAddress: string } | null;
  customFields?: {
    tallyClientOrderId: string | null;
    tallySaleAt: string | null;
    tallyRegisterId: string | null;
    tallySessionId: string | null;
    tallyCashierRef: string | null;
    tallyRejected: boolean | null;
    tallyRejectedClientOrderId: string | null;
  };
}

export interface VendureOrder extends VendureOrderSummary {
  active: boolean;
  lines: {
    id: string;
    quantity: number;
    taxRate: number;
    productVariant: { id: string; name: string; sku: string };
    unitPrice: number;
    unitPriceWithTax: number;
    linePrice: number;
    linePriceWithTax: number;
    discountedLinePrice: number;
    discountedLinePriceWithTax: number;
    discounts: { description: string; amount: number; amountWithTax: number }[];
    customFields?: {
      tallyCustomName: string | null;
      tallyCustomSku: string | null;
      tallyUnitPrice: number | null;
      tallyPriceIncludesTax: boolean | null;
      tallyClientLineId: string | null;
    };
  }[];
  shippingLines: { shippingMethod: { name: string }; price: number; priceWithTax: number }[];
  surcharges: { description: string; sku: string; price: number; priceWithTax: number }[];
  subTotal: number;
  subTotalWithTax: number;
  shipping: number;
  shippingWithTax: number;
  taxSummary: { description: string; taxRate: number; taxBase: number; taxTotal: number }[];
  discounts: { description: string; amount: number; amountWithTax: number }[];
  couponCodes: string[];
  payments?: {
    id: string;
    method: string;
    amount: number;
    state: string;
    transactionId: string;
    createdAt: string;
    metadata: unknown;
    refunds: { id: string; total: number; state: string; reason: string; lines: { orderLineId: string; quantity: number }[] }[];
  }[];
  fulfillments?: { id: string; state: string; method: string; trackingCode: string }[];
  customFields?: VendureOrderSummary['customFields'] & {
    tallyPayments: string | null;
    tallySnapshot: string | null;
    tallyShipping: string | null;
  };
}

const ORDER_ROW_FIELDS = `
  id code state orderPlacedAt updatedAt currencyCode totalQuantity total totalWithTax
  customer { id firstName lastName emailAddress }
`;
const ORDER_CUSTOM_FIELDS = 'tallyClientOrderId tallySaleAt tallyRegisterId tallySessionId tallyCashierRef tallyRejected tallyRejectedClientOrderId';
const TALLY_ORDER_ROW_FIELDS = `${ORDER_ROW_FIELDS} customFields { ${ORDER_CUSTOM_FIELDS} }`;
const ORDER_DETAIL_FIELDS_START = `
  id code state active orderPlacedAt updatedAt currencyCode totalQuantity
  customer { id firstName lastName emailAddress }
  lines {`;
const ORDER_DETAIL_FIELDS_END = `
    id quantity taxRate productVariant { id name sku }
    unitPrice unitPriceWithTax linePrice linePriceWithTax discountedLinePrice discountedLinePriceWithTax
    discounts { description amount amountWithTax }
  }
  shippingLines { shippingMethod { name } price priceWithTax }
  surcharges { description sku price priceWithTax }
  subTotal subTotalWithTax shipping shippingWithTax total totalWithTax
  taxSummary { description taxRate taxBase taxTotal }
  discounts { description amount amountWithTax }
  couponCodes
  payments { id method amount state transactionId createdAt metadata refunds { id total state reason lines { orderLineId quantity } } }
  fulfillments { id state method trackingCode }
`;
const ORDER_DETAIL_FIELDS = `${ORDER_DETAIL_FIELDS_START}${ORDER_DETAIL_FIELDS_END}`;
const TALLY_ORDER_DETAIL_FIELDS = `${ORDER_DETAIL_FIELDS_START}
  customFields { tallyCustomName tallyCustomSku tallyUnitPrice tallyPriceIncludesTax tallyClientLineId }
${ORDER_DETAIL_FIELDS_END} customFields { ${ORDER_CUSTOM_FIELDS} tallyPayments tallySnapshot tallyShipping }`;

const LIST_QUERY = `query Orders($options: OrderListOptions) {
  orders(options: $options) { items { ${ORDER_ROW_FIELDS} } totalItems }
}`;
const TALLY_LIST_QUERY = LIST_QUERY.replace(ORDER_ROW_FIELDS, TALLY_ORDER_ROW_FIELDS);
const CUSTOMER_LIST_QUERY = `query CustomerOrders($customerId: ID!, $options: OrderListOptions) {
  customer(id: $customerId) { orders(options: $options) { items { ${ORDER_ROW_FIELDS} } totalItems } }
}`;
const TALLY_CUSTOMER_LIST_QUERY = CUSTOMER_LIST_QUERY.replace(ORDER_ROW_FIELDS, TALLY_ORDER_ROW_FIELDS);
const DETAIL_QUERY = `query Order($id: ID!) {
  order(id: $id) { ${ORDER_DETAIL_FIELDS} }
}`;
const TALLY_DETAIL_QUERY = `query Order($id: ID!) {
  order(id: $id) { ${TALLY_ORDER_DETAIL_FIELDS} }
}`;

export async function listVendureOrders(context: SyncContext, options: VendureOrderListOptions = {}): Promise<VendureOrderList<VendureOrderSummary>> {
  const skip = Math.max(0, Math.trunc(Number.isFinite(options.skip) ? options.skip! : 0));
  const take = Math.max(1, Math.min(100, Math.trunc(Number.isFinite(options.take) ? options.take! : 25)));
  const date = options.orderPlacedAt;
  const orderPlacedAt = {
    ...(date?.after !== undefined ? { after: date.after } : {}),
    ...(date?.before !== undefined ? { before: date.before } : {}),
    ...(date?.between !== undefined ? { between: date.between } : {}),
  };
  const q = options.search?.trim();
  const filter = {
    orderPlacedAt: Object.keys(orderPlacedAt).length ? orderPlacedAt : { isNull: false },
    ...(options.state?.length ? { state: { in: options.state } } : {}),
    ...(options.tallyRegisterId ? { tallyRegisterId: { eq: options.tallyRegisterId } } : {}),
    ...(options.tallyCashierRef ? { tallyCashierRef: { eq: options.tallyCashierRef } } : {}),
    ...(q ? { _or: [{ code: { contains: q } }, { customerLastName: { contains: q } }] } : {}),
  };
  const variables = {
    options: { skip, take, sort: { orderPlacedAt: 'DESC', id: 'DESC' }, filter },
    ...(options.customerId ? { customerId: options.customerId } : {}),
  };
  const query = options.customerId
    ? (options.tallyFields === false ? CUSTOMER_LIST_QUERY : TALLY_CUSTOMER_LIST_QUERY)
    : (options.tallyFields === false ? LIST_QUERY : TALLY_LIST_QUERY);
  const body = await gql(context, query, variables);
  if (options.customerId && body?.data?.customer === null) return { items: [], totalItems: 0 };
  const result = options.customerId ? body?.data?.customer?.orders : body?.data?.orders;
  if (!result || typeof result !== 'object' || !Array.isArray(result.items) || typeof result.totalItems !== 'number') {
    throw new Error('Vendure sent an unexpected orders response');
  }
  return { items: result.items, totalItems: result.totalItems };
}

export async function getVendureOrder(context: SyncContext, id: string, options?: { tallyFields?: boolean }): Promise<VendureOrder | null> {
  const body = await gql(context, options?.tallyFields === false ? DETAIL_QUERY : TALLY_DETAIL_QUERY, { id });
  const order = body?.data?.order;
  if (order === null) return null;
  if (typeof order !== 'object' || typeof order?.id !== 'string') {
    throw new Error('Vendure sent an unexpected order response');
  }
  return order;
}
