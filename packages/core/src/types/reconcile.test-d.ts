import { describe, expectTypeOf, it } from 'vitest';
import type { CatalogueReconcileAdapter } from '@tallyui/core';

type Product = { uuid: string; stamp: string };
const listing = {
  async *fetchPages() { yield { entries: [], cursor: 0 }; },
  fingerprint: (doc: Product) => doc.stamp,
  enqueue: () => {},
};

describe('deletion proof is required at the type level (#248)', () => {
  it('a catalogue adapter without confirmGone does not compile', () => {
    // @ts-expect-error: confirmGone is required
    const unproven: CatalogueReconcileAdapter<Product, number> = listing;
    expectTypeOf(unproven).not.toBeNever();
  });

  it('a catalogue adapter with confirmGone compiles', () => {
    const proven: CatalogueReconcileAdapter<Product, number> = { ...listing, confirmGone: async () => [] };
    expectTypeOf(proven.confirmGone).toBeFunction();
  });
});
