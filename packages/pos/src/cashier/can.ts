import { isCashierPermission, type Cashier, type CashierPermission } from '@tallyui/core';

/**
 * Whether `cashier` may do `permission`. A `null` or `undefined` cashier (a connector with no `cashier()`, or one
 * that resolved `null`) is allowed everything: today's behaviour, before connectors had permissions. A name that is
 * not a `CashierPermission` is never allowed, and a permission the cashier's list does not name is denied.
 */
export function can(cashier: Cashier | null | undefined, permission: CashierPermission): boolean {
  if (!isCashierPermission(permission)) return false;
  if (!cashier) return true;
  return cashier.permissions.includes(permission);
}
