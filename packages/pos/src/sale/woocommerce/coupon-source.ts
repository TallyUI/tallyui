import type { RxCollection } from 'rxdb';
import type { PosOrder } from '../../pos-order/types';
import type { SaleCoupon, SaleCouponSource } from './coupons';

/** How long an applied order still counts when no pull has rewritten its coupon: a refetch that finds the coupon unchanged writes nothing, and the store is authoritative (ADR-077 amendment 2). */
export const APPLIED_USE_GRACE_MS = 600_000;

export function createSaleCouponSource(deps: {
  coupons: RxCollection;
  products: RxCollection;
  orders: RxCollection<PosOrder>;
  now?: () => number;
}): SaleCouponSource {
  const now = deps.now ?? Date.now;
  return {
    async find(code) {
      let doc = await deps.coupons.findOne({ selector: { code } }).exec();
      if (!doc) {
        doc = (await deps.coupons.find().exec()).find((coupon) =>
          typeof coupon.code === 'string' && coupon.code.toLowerCase() === code) ?? null;
      }
      if (!doc) return null;
      const data = doc.toJSON(true);
      if (!['percent', 'fixed_cart', 'fixed_product'].includes(data.discount_type)
        || !Number.isInteger(data.id) || typeof data.amount !== 'string') return null;
      const orders = await deps.orders.find({ selector: { syncStatus: { $in: ['pending', 'applied'] } } }).exec();
      const counted = orders.filter((order) => order.coupons?.some((coupon) => coupon.code === code)
        && (order.syncStatus === 'pending' || (Date.parse(order.updatedAt) > data._meta.lwt
          && now() - Date.parse(order.updatedAt) < APPLIED_USE_GRACE_MS)));
      const usedBy = [...(data.used_by ?? [])];
      for (const order of counted) {
        const customer = order.customer?.id ?? order.customer?.email;
        if (customer !== undefined) usedBy.push(customer);
      }
      const fields = [
        'limit_usage_to_x_items', 'product_ids', 'excluded_product_ids',
        'product_categories', 'excluded_product_categories', 'exclude_sale_items', 'individual_use',
        'date_expires_gmt', 'usage_limit', 'usage_limit_per_user', 'minimum_amount', 'maximum_amount', 'email_restrictions',
      ];
      return {
        ...Object.fromEntries(fields.filter((field) => field in data).map((field) => [field, data[field]])) as Partial<SaleCoupon>,
        discount_type: data.discount_type, amount: data.amount,
        id: data.id, code, usage_count: (data.usage_count ?? 0) + counted.length, used_by: usedBy,
      };
    },
    async productCategories(productIds) {
      const products = await deps.products.find({ selector: { id: { $in: [...productIds] } } }).exec();
      return new Map(products.map((product) => [product.id,
        (product.categories ?? []).map(({ id }: { id: number }) => ({ id }))]));
    },
  };
}
