import { wooCouponSchema } from '../schemas/coupons';
import { wooProductUuid } from './products';

/**
 * One coupon row as the till stores it: a coupon without a uuid cannot be keyed and is skipped, never thrown,
 * so one bad row cannot stall the coupons' pull. A coupon that is not published arrives deleted.
 */
export function toCouponDocument(coupon: any): any | undefined {
  const uuid = wooProductUuid(coupon);
  if (uuid === undefined) return undefined;
  const projected = Object.fromEntries(Object.keys(wooCouponSchema.properties)
    .filter((key) => Object.prototype.hasOwnProperty.call(coupon, key))
    .map((key) => [key, coupon[key]]));
  if (Array.isArray(projected.used_by)) projected.used_by = projected.used_by.map(String);
  return { ...projected, uuid, _deleted: coupon.status !== 'publish' };
}
