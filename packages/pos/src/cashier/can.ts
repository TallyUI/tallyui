import { isCashierPermission, type Cashier, type CashierPermission } from '@tallyui/core';

// These permissions require an explicit grant on a cashier record.
const OPT_IN: readonly CashierPermission[] = ['editProducts'];

/**
 * Whether `cashier` may do `permission`. A `null` or `undefined` cashier (a connector with no `cashier()`, or one
 * that resolved `null`) is allowed everything except opt-in permissions. A name that is
 * not a `CashierPermission` is never allowed, and a permission the cashier's list does not name is denied.
 */
export function can(cashier: Cashier | null | undefined, permission: CashierPermission): boolean {
  if (!isCashierPermission(permission)) return false;
  if (!cashier) return !OPT_IN.includes(permission);
  return cashier.permissions.includes(permission);
}
