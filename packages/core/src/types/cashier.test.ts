import { describe, expect, it } from 'vitest';
import { CASHIER_PERMISSIONS, cashierPermissions, isCashierPermission } from './cashier';

describe('cashierPermissions', () => {
  it('keeps the known names in order and drops unknown ones', () => {
    expect(cashierPermissions(['refund', 'manage_woocommerce_pos', 'viewReports', 42, null])).toEqual(['refund', 'viewReports']);
  });

  it('drops duplicates', () => {
    expect(cashierPermissions(['discount', 'discount'])).toEqual(['discount']);
  });
});

describe('isCashierPermission', () => {
  it.each(CASHIER_PERMISSIONS)('accepts %s', (permission) => {
    expect(isCashierPermission(permission)).toBe(true);
  });

  it('rejects other values', () => {
    expect(isCashierPermission('viewreports')).toBe(false);
    expect(isCashierPermission(undefined)).toBe(false);
  });
});
