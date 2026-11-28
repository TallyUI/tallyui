import { describe, expect, it } from 'vitest';
import type { ProductEdit, ProductEditChange, ProductEditField, ProductEditTarget, SyncContext } from '@tallyui/core';

export interface ProductEditHarness {
  /** A fresh in-memory store whose target holds `value` for `field`. */
  setup(field: ProductEditField, value: ProductEditChange['from']): {
    edit: ProductEdit; context: SyncContext; target: ProductEditTarget;
    /** What the store now holds for `field`. */
    stored(): unknown;
    /** How many writes reached the store. */
    writes(): number;
    /** Simulate another person's edit landing between the till's read and its write. */
    changeBehindTheTill(value: unknown): void;
  };
}

export function describeProductEditConformance(name: string, harness: ProductEditHarness,
  cases: readonly (ProductEditChange & { other: ProductEditChange['from'] })[]): void {
  describe(`${name} product edits`, () => {
    for (const { other, ...change } of cases) {
      const { field, from, to } = change;
      const key = field === 'manageStock' ? 'value' : field === 'stockOnHand' ? 'quantity' : 'amount';
      const snapshot = (value: ProductEditChange['from']) => ({ [field]: { [key]: value } });

      describe(field, () => {
        it('reads the value the edit opens on', async () => {
          const { edit, context, target } = harness.setup(field, from);
          expect(await edit.read(context, target)).toMatchObject(snapshot(from));
        });

        it('saves one write and returns the stored value', async () => {
          const { edit, context, target, stored, writes } = harness.setup(field, from);
          expect(await edit.update(context, target, change)).toMatchObject({ status: 'saved', snapshot: snapshot(to) });
          expect(stored()).toBe(to);
          expect(writes()).toBe(1);
        });

        it('does not write the same update twice', async () => {
          const { edit, context, target, writes } = harness.setup(field, from);
          await edit.update(context, target, change);
          expect(writes()).toBe(1);
          expect(await edit.update(context, target, change)).toMatchObject({ status: 'already', snapshot: snapshot(to) });
          expect(writes()).toBe(1);
        });

        it('leaves another person’s edit intact and returns their value', async () => {
          const { edit, context, target, changeBehindTheTill, stored, writes } = harness.setup(field, from);
          await edit.read(context, target);
          changeBehindTheTill(other);
          const before = writes();
          expect(await edit.update(context, target, change)).toMatchObject({ status: 'conflict', snapshot: snapshot(other) });
          expect(stored()).toBe(other);
          expect(writes()).toBe(before);
        });

        it('does not claim a save for a value already in the store', async () => {
          const { edit, context, target, writes } = harness.setup(field, to);
          expect(await edit.update(context, target, change)).toMatchObject({ status: 'already', snapshot: snapshot(to) });
          expect(writes()).toBe(0);
        });

        if (change.field === 'basePrice' || change.field === 'salePrice') {
          it('returns the fresh snapshot without writing on a different tax basis', async () => {
            const { edit, context, target, writes } = harness.setup(field, from);
            const fresh = await edit.read(context, target);
            const basis = { ...change.basis, taxInclusive: !change.basis.taxInclusive };
            expect(await edit.update(context, target, { ...change, basis })).toEqual({ status: 'conflict', snapshot: fresh });
            expect(writes()).toBe(0);
          });
        }

        if (change.field === 'stockOnHand') {
          it('returns the fresh snapshot without writing at another location', async () => {
            const { edit, context, target, writes } = harness.setup(field, from);
            const fresh = await edit.read(context, target);
            const locationId = change.locationId === null ? 'loc_other' : null;
            expect(await edit.update(context, target, { ...change, locationId })).toEqual({ status: 'conflict', snapshot: fresh });
            expect(writes()).toBe(0);
          });
        }

        if (field !== 'manageStock') {
          it('refuses an invalid value without writing', async () => {
            const { edit, context, target, writes } = harness.setup(field, from);
            const invalid = { ...change, to: field === 'stockOnHand' ? 1.5 : -1 };
            expect(await edit.update(context, target, invalid)).toMatchObject({ status: 'refused', code: 'invalid' });
            expect(writes()).toBe(0);
          });
        }
      });
    }

    it('returns a conflict without writing a field missing from this target', async () => {
      const absent = (['basePrice', 'salePrice', 'stockOnHand', 'manageStock'] as const)
        .find(field => !cases.some(change => change.field === field));
      const first = cases[0];
      const field = absent ?? cases[1].field;
      const change: ProductEditChange = field === 'manageStock' ? { field, from: 'off', to: 'on' } : field === 'stockOnHand'
        ? { field, from: 1, to: 2, locationId: null } : { field, from: 1, to: 2, basis: { currency: 'USD', taxInclusive: false } };
      const { edit, context, target, writes } = absent ? harness.setup(absent, change.from) : harness.setup(first.field, first.from);
      const fresh = await edit.read(context, target);
      expect(fresh).not.toBeNull();
      expect(fresh).not.toHaveProperty(field);
      expect(await edit.update(context, target, change)).toEqual({ status: 'conflict', snapshot: fresh });
      expect(writes()).toBe(0);
    });
  });
}
