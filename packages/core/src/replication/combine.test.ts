import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import type { ReplicationAdapter } from '../types';
import { combinePullAdapters } from './combine';

type Doc = { id: string; from?: string; _deleted: boolean };
const context = { connectorId: 'test', baseUrl: 'https://test', headers: {} };
const docs = (from: number, count: number, tag = '') =>
  Array.from({ length: count }, (_, i) => ({ id: String(from + i), from: tag, _deleted: false }));
const fake = (result: { documents?: Doc[]; checkpoint?: any } | (() => Promise<any>)) => {
  const handler = vi.fn(typeof result === 'function'
    ? result
    : async () => ({ documents: result.documents ?? [], checkpoint: result.checkpoint ?? {} }));
  return { adapter: { pull: { handler } } as ReplicationAdapter<Doc, any>, handler };
};

describe('combinePullAdapters', () => {
  it('passes each sub-adapter only its own checkpoint', async () => {
    const a = fake({ checkpoint: { skip: 1 } });
    const b = fake({ checkpoint: { skip: 2 } });
    const combined = combinePullAdapters({ a: a.adapter, b: b.adapter });
    await combined.pull.handler(undefined, 100, context);
    expect(a.handler).toHaveBeenLastCalledWith(undefined, 100, context);
    expect(b.handler).toHaveBeenLastCalledWith(undefined, 100, context);
    await combined.pull.handler({ a: { skip: 10 }, b: { skip: 20 } }, 100, context);
    expect(a.handler).toHaveBeenLastCalledWith({ skip: 10 }, 100, context);
    expect(b.handler).toHaveBeenLastCalledWith({ skip: 20 }, 100, context);
  });

  it('merges each sub-checkpoint as RxDB would, keeping explicit undefined', async () => {
    const a = fake({ checkpoint: { skip: 0, updatedAt: 'new', passTotal: undefined } });
    const b = fake({ checkpoint: { skip: 5 } });
    const combined = combinePullAdapters({ a: a.adapter, b: b.adapter });
    const { checkpoint } = await combined.pull.handler(
      { a: { skip: 100, updatedAt: 'old', passTotal: 300, extra: 'kept' }, b: { skip: 0, updatedAt: 'b' } }, 100, context,
    );
    expect(checkpoint).toEqual({
      a: { skip: 0, updatedAt: 'new', passTotal: undefined, extra: 'kept' },
      b: { skip: 5, updatedAt: 'b' },
    });
    expect('passTotal' in checkpoint.a).toBe(true);
    expect(checkpoint.a.passTotal).toBeUndefined();
  });

  it('maps an old flat checkpoint to legacyKey, and ignores it once sub keys exist', async () => {
    const products = fake({ checkpoint: { skip: 0 } });
    const variants = fake({ checkpoint: { skip: 0 } });
    const combined = combinePullAdapters({ products: products.adapter, variants: variants.adapter }, { legacyKey: 'products' });
    const flat = { skip: 0, updatedAt: 'mark' };
    const first = await combined.pull.handler(flat, 100, context);
    expect(products.handler).toHaveBeenLastCalledWith(flat, 100, context);
    expect(variants.handler).toHaveBeenLastCalledWith(undefined, 100, context);
    expect(first.checkpoint.products).toEqual({ skip: 0, updatedAt: 'mark' });
    // RxDB stacks the combined checkpoint onto the stored flat one.
    await combined.pull.handler({ ...flat, ...first.checkpoint }, 100, context);
    expect(products.handler).toHaveBeenLastCalledWith({ skip: 0, updatedAt: 'mark' }, 100, context);
    expect(variants.handler).toHaveBeenLastCalledWith({ skip: 0 }, 100, context);
    await combined.pull.handler({ variants: { skip: 7 }, skip: 3 }, 100, context);
    expect(products.handler).toHaveBeenLastCalledWith(undefined, 100, context);
  });

  describe('seedCheckpoint', () => {
    const seeded = () => {
      const calls: string[] = [];
      const feed = (key: string, seed?: object) => {
        const handler = vi.fn(async () => { calls.push(`${key}.handler`); return { documents: [], checkpoint: { skip: 1 } }; });
        const seedCheckpoint = seed && vi.fn(async () => { calls.push(`${key}.seed`); return seed; });
        return { adapter: { pull: { handler, seedCheckpoint } } as ReplicationAdapter<Doc, any>, handler, seedCheckpoint };
      };
      const products = feed('products');
      const variants = feed('variants', { skip: 0, updatedAt: 'mark' });
      const prices = feed('prices', { skip: 0, updatedAt: 'price-mark' });
      const combined = combinePullAdapters(
        { products: products.adapter, variants: variants.adapter, prices: prices.adapter }, { legacyKey: 'products' },
      );
      return { calls, products, variants, prices, combined };
    };

    it.each([undefined, null, {}])('seeds a fresh install (%o) before any handler, in key order', async (stored) => {
      const { calls, products, variants, prices, combined } = seeded();
      const { checkpoint } = await combined.pull.handler(stored as any, 100, context);
      expect(calls).toEqual(['variants.seed', 'prices.seed', 'products.handler', 'variants.handler', 'prices.handler']);
      expect(variants.seedCheckpoint).toHaveBeenCalledWith(context);
      expect(variants.handler).toHaveBeenLastCalledWith({ skip: 0, updatedAt: 'mark' }, 100, context);
      expect(prices.handler).toHaveBeenLastCalledWith({ skip: 0, updatedAt: 'price-mark' }, 100, context);
      // A sub-adapter without a seed starts as before.
      expect(products.handler).toHaveBeenLastCalledWith(undefined, 100, context);
      // The seed is saved with this call's checkpoint, under the handler's result.
      expect(checkpoint).toEqual({
        products: { skip: 1 }, variants: { skip: 1, updatedAt: 'mark' }, prices: { skip: 1, updatedAt: 'price-mark' },
      });
    });

    it.each([
      ['a stored combined checkpoint', { products: { skip: 0, updatedAt: 'p' } }],
      ['a legacy flat checkpoint', { skip: 0, updatedAt: 'p' }],
    ])('never seeds %s', async (_name, stored) => {
      const { calls, variants, combined } = seeded();
      await combined.pull.handler(stored, 100, context);
      expect(calls).toEqual(['products.handler', 'variants.handler', 'prices.handler']);
      // The upgrade keeps the variant feed's full healing pass.
      expect(variants.handler).toHaveBeenLastCalledWith(undefined, 100, context);
    });

    it('re-seeds from scratch on retry after a seedCheckpoint rejects, with no handler run on the failed call', async () => {
      const { calls, products, variants, prices, combined } = seeded();
      variants.seedCheckpoint!.mockRejectedValueOnce(new Error('seed failed'));
      await expect(combined.pull.handler(undefined, 100, context)).rejects.toThrow('seed failed');
      // The seed loop stops at the first rejection: variants.seed ran (and rejected,
      // so it logged nothing), prices was never reached, and no handler ran at all.
      expect(calls).toEqual([]);
      expect(variants.seedCheckpoint).toHaveBeenCalledTimes(1);
      expect(prices.seedCheckpoint).not.toHaveBeenCalled();
      expect(products.handler).not.toHaveBeenCalled();
      expect(variants.handler).not.toHaveBeenCalled();
      expect(prices.handler).not.toHaveBeenCalled();
      // RxDB retries with the same (still empty) checkpoint; nothing was stored, so it seeds again from scratch.
      calls.length = 0;
      const { checkpoint } = await combined.pull.handler(undefined, 100, context);
      expect(calls).toEqual(['variants.seed', 'prices.seed', 'products.handler', 'variants.handler', 'prices.handler']);
      expect(variants.seedCheckpoint).toHaveBeenCalledTimes(2);
      expect(variants.handler).toHaveBeenLastCalledWith({ skip: 0, updatedAt: 'mark' }, 100, context);
      expect(checkpoint.variants).toEqual({ skip: 1, updatedAt: 'mark' });
    });
  });

  it.each([
    [100, 0, 100],
    [30, 100, 130],
    [30, 20, 50],
  ])('returns a short page only when all sub-pages are short (%i + %i)', async (first, second, total) => {
    const a = fake({ documents: docs(1, first) });
    const b = fake({ documents: docs(1001, second) });
    const { documents } = await combinePullAdapters({ a: a.adapter, b: b.adapter }).pull.handler(undefined, 100, context);
    expect(documents).toHaveLength(total);
    expect(documents.length >= 100).toBe(first >= 100 || second >= 100);
  });

  it('keeps the later key\'s document for a duplicate id', async () => {
    const a = fake({ documents: docs(1, 3, 'a') });
    const b = fake({ documents: docs(2, 3, 'b') });
    const { documents } = await combinePullAdapters({ a: a.adapter, b: b.adapter }).pull.handler(undefined, 100, context);
    expect(Object.fromEntries(documents.map((d) => [d.id, d.from]))).toEqual({ 1: 'a', 2: 'b', 3: 'b', 4: 'b' });
  });

  it('runs sub-handlers strictly in sequence', async () => {
    let resolveFirst!: (value: { documents: Doc[]; checkpoint: object }) => void;
    const a = fake(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const b = fake({});
    const call = combinePullAdapters({ a: a.adapter, b: b.adapter }).pull.handler(undefined, 100, context);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(a.handler).toHaveBeenCalledTimes(1);
    expect(b.handler).not.toHaveBeenCalled();
    resolveFirst({ documents: [], checkpoint: {} });
    await call;
    expect(b.handler).toHaveBeenCalledTimes(1);
  });

  it('throws when a sub-adapter throws', async () => {
    const a = fake({});
    const b = fake(async () => { throw new Error('boom'); });
    await expect(combinePullAdapters({ a: a.adapter, b: b.adapter }).pull.handler(undefined, 100, context)).rejects.toThrow('boom');
  });

  it('throws at creation for a sub-adapter with push or stream$', () => {
    const { adapter } = fake({});
    expect(() => combinePullAdapters({ a: adapter, b: { ...adapter, push: { handler: async () => [] } } }))
      .toThrow(/"b" has push or pull.stream\$/);
    expect(() => combinePullAdapters({ a: { pull: { ...adapter.pull, stream$: of() } } }))
      .toThrow(/"a" has push or pull.stream\$/);
  });
});
