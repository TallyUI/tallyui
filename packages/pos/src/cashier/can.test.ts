import { describe, expect, it } from 'vitest';
import { CASHIER_PERMISSIONS } from '@tallyui/core';
import type { Cashier, CashierPermission } from '@tallyui/core';
import { can } from './can';

const cashier = (permissions: readonly string[]): Cashier =>
  ({ id: '1', name: 'Ana', permissions }) as unknown as Cashier;

describe('can', () => {
  it.each(CASHIER_PERMISSIONS)('allows %s when the cashier has it', (permission) => {
    expect(can(cashier([permission]), permission)).toBe(true);
  });

  it.each(CASHIER_PERMISSIONS)('denies %s when the cashier lacks it', (permission) => {
    expect(can(cashier(CASHIER_PERMISSIONS.filter((other) => other !== permission)), permission)).toBe(false);
  });

  it('allows everything for a null or undefined cashier', () => {
    for (const permission of CASHIER_PERMISSIONS) {
      expect(can(null, permission)).toBe(true);
      expect(can(undefined, permission)).toBe(true);
    }
  });

  it('never allows an unknown permission name', () => {
    const unknown = 'manage_woocommerce_pos' as CashierPermission;
    expect(can(null, unknown)).toBe(false);
    expect(can(cashier([unknown]), unknown)).toBe(false);
  });
});
