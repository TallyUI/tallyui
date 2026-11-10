/**
 * The neutral POS permissions a connector resolves from its own model (v2 parity A12):
 * - `viewReports`: Reports, and a count that shows the expected figures (not blind);
 * - `manageClosures`: recount and close without an approver;
 * - `approveVariance`: approve another cashier's over-threshold count;
 * - `refund`: take refunds;
 * - `discount`: give discounts.
 */
export const CASHIER_PERMISSIONS = ['viewReports', 'manageClosures', 'approveVariance', 'refund', 'discount'] as const;

/** One of `CASHIER_PERMISSIONS`. */
export type CashierPermission = (typeof CASHIER_PERMISSIONS)[number];

/** The signed-in cashier, as the connector maps the platform's user (v2 parity A12). */
export interface Cashier {
  /** The platform's id for the signed-in user. */
  id: string;
  /** The display name, as receipts and the handover show it. */
  name: string;
  /** What this cashier may do; a permission left out is denied. */
  permissions: readonly CashierPermission[];
}

/** Whether `value` is one of the five permission names. */
export function isCashierPermission(value: unknown): value is CashierPermission {
  return (CASHIER_PERMISSIONS as readonly unknown[]).includes(value);
}

/** The known permission names in `values`, first occurrence order, without duplicates; anything else is dropped. */
export function cashierPermissions(values: readonly unknown[]): CashierPermission[] {
  return [...new Set(values.filter(isCashierPermission))];
}
