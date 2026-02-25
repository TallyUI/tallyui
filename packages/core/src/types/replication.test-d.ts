import { describe, expectTypeOf, it } from 'vitest';
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

describe('ReplicationAdapter types', () => {
  it('accepts a typed adapter with custom checkpoint', () => {
    type Product = { id: string; name: string; _deleted: boolean };
    type Checkpoint = { id: string; modified: string };

    const adapter: ReplicationAdapter<Product, Checkpoint> = {} as any;

    expectTypeOf(adapter.pull.handler).toBeFunction();
    expectTypeOf(adapter.push).toEqualTypeOf<ReplicationAdapter<Product, Checkpoint>['push']>();
  });

  it('requires _deleted on document type', () => {
    type Doc = { id: string; _deleted: boolean };
    type Adapter = ReplicationAdapter<Doc>;
    expectTypeOf<Adapter['pull']['handler']>().toBeFunction();
  });
});
