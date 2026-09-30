import { describe, expect, it, vi } from 'vitest';
import { createReconcileFeed } from './reconcile-feed';

type Doc = { id: string; name: string };
const context = { connectorId: 'test', baseUrl: 'https://test', headers: {} };
const local = (id: string): Doc => ({ id, name: `local-${id}` });

describe('createReconcileFeed', () => {
  it('gives an empty page and an unchanged checkpoint for an empty queue', async () => {
    const fetchByIds = vi.fn();
    const { adapter } = createReconcileFeed<Doc>({ fetchByIds });
    expect(await adapter.pull.handler(undefined, 100, context)).toEqual({ documents: [], checkpoint: { n: 0 } });
    expect(await adapter.pull.handler({ n: 3 }, 100, context)).toEqual({ documents: [], checkpoint: { n: 3 } });
    expect(fetchByIds).not.toHaveBeenCalled();
  });

  it('fetches queued ids in chunks of at most 1,000', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => String(i + 1));
    const fetchByIds = vi.fn(async (chunk: string[]) => chunk.map((id) => ({ id, name: `remote-${id}` })));
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue(ids.map((id) => ({ id, local: local(id) })));
    const { documents } = await adapter.pull.handler(undefined, 100, context);
    expect(fetchByIds).toHaveBeenCalledTimes(3);
    expect(fetchByIds.mock.calls.map(([chunk]) => chunk.length)).toEqual([1000, 1000, 500]);
    expect(documents).toHaveLength(2500);
  });

  it('delivers a fetched document and an absent id as a tombstoned local copy', async () => {
    const fetchByIds = vi.fn(async () => [{ id: '1', name: 'remote-1' }]);
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue([{ id: '1', local: local('1') }, { id: '2', local: local('2') }]);
    const { documents } = await adapter.pull.handler(undefined, 100, context);
    expect(documents).toEqual([
      { id: '1', name: 'remote-1', _deleted: false },
      { id: '2', name: 'local-2', _deleted: true },
    ]);
  });

  it('drains the queue once; the next call is empty and the checkpoint n increments', async () => {
    const fetchByIds = vi.fn(async (chunk: string[]) => chunk.map((id) => ({ id, name: `remote-${id}` })));
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue([{ id: '1', local: local('1') }]);
    const first = await adapter.pull.handler(undefined, 100, context);
    expect(first.checkpoint).toEqual({ n: 1 });
    const second = await adapter.pull.handler(first.checkpoint, 100, context);
    expect(second).toEqual({ documents: [], checkpoint: { n: 1 } });
    expect(fetchByIds).toHaveBeenCalledTimes(1);

    enqueue([{ id: '2', local: local('2') }]);
    const third = await adapter.pull.handler(second.checkpoint, 100, context);
    expect(third.checkpoint).toEqual({ n: 2 });
  });

  it('rethrows and keeps the entries for the next call when fetchByIds throws', async () => {
    const error = new Error('boom');
    const fetchByIds = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce([{ id: '1', name: 'remote-1' }]);
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue([{ id: '1', local: local('1') }]);
    await expect(adapter.pull.handler(undefined, 100, context)).rejects.toThrow('boom');
    const { documents, checkpoint } = await adapter.pull.handler(undefined, 100, context);
    expect(documents).toEqual([{ id: '1', name: 'remote-1', _deleted: false }]);
    expect(checkpoint).toEqual({ n: 1 });
    expect(fetchByIds).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates a repeated id; the last enqueue wins and it is fetched once', async () => {
    const fetchByIds = vi.fn(async () => []); // nothing found back, so the tombstone carries whichever `local` won
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue([{ id: '1', local: local('1') }]);
    enqueue([{ id: '1', local: { id: '1', name: 'local-1-newer' } }]);
    const { documents } = await adapter.pull.handler(undefined, 100, context);
    expect(fetchByIds).toHaveBeenCalledTimes(1);
    expect(fetchByIds).toHaveBeenCalledWith(['1'], context);
    expect(documents).toEqual([{ id: '1', name: 'local-1-newer', _deleted: true }]);
  });

  it('keeps an entry enqueued while a failed fetch was in flight over the restored one', async () => {
    const fetchByIds = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue([{ id: '1', local: local('1') }]);
    const handlerPromise = adapter.pull.handler(undefined, 100, context);
    // The queue is drained synchronously before the first await, so this lands
    // in the fresh queue while `fetchByIds` is still in flight.
    enqueue([{ id: '1', local: { id: '1', name: 'local-1-newer' } }]);
    await expect(handlerPromise).rejects.toThrow('boom');

    const { documents } = await adapter.pull.handler(undefined, 100, context);
    expect(documents).toEqual([{ id: '1', name: 'local-1-newer', _deleted: true }]);
  });

  it('skips a missing refreshOnly entry -- no document at all, never a tombstone', async () => {
    const fetchByIds = vi.fn(async () => []);
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue([{ id: '1', local: local('1'), refreshOnly: true }]);
    const { documents } = await adapter.pull.handler(undefined, 100, context);
    expect(documents).toEqual([]);
  });

  it('re-delivers an existing refreshOnly entry like any other', async () => {
    const fetchByIds = vi.fn(async () => [{ id: '1', name: 'remote-1' }]);
    const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
    enqueue([{ id: '1', local: local('1'), refreshOnly: true }]);
    const { documents } = await adapter.pull.handler(undefined, 100, context);
    expect(documents).toEqual([{ id: '1', name: 'remote-1', _deleted: false }]);
  });

  describe('merging refreshOnly on a repeated id', () => {
    it('a plain entry then a refreshOnly one still tombstones -- never downgraded', async () => {
      const fetchByIds = vi.fn(async () => []);
      const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
      enqueue([{ id: '1', local: local('1') }]);
      enqueue([{ id: '1', local: local('1'), refreshOnly: true }]);
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(documents).toEqual([{ id: '1', name: 'local-1', _deleted: true }]);
    });

    it('a refreshOnly entry then a plain one tombstones', async () => {
      const fetchByIds = vi.fn(async () => []);
      const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
      enqueue([{ id: '1', local: local('1'), refreshOnly: true }]);
      enqueue([{ id: '1', local: local('1') }]);
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(documents).toEqual([{ id: '1', name: 'local-1', _deleted: true }]);
    });

    it('a failed fetch never downgrades: a plain entry restored after a mid-fetch refreshOnly one still tombstones', async () => {
      let enqueueMidFetch = () => {};
      const fetchByIds = vi.fn()
        .mockImplementationOnce(async () => { enqueueMidFetch(); throw new Error('network'); })
        .mockImplementation(async () => []);
      const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
      enqueueMidFetch = () => enqueue([{ id: '1', local: local('1'), refreshOnly: true }]);
      enqueue([{ id: '1', local: local('1') }]);
      await expect(adapter.pull.handler(undefined, 100, context)).rejects.toThrow('network');
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(documents).toEqual([{ id: '1', name: 'local-1', _deleted: true }]);
    });

    it('two refreshOnly entries skip', async () => {
      const fetchByIds = vi.fn(async () => []);
      const { adapter, enqueue } = createReconcileFeed<Doc>({ fetchByIds });
      enqueue([{ id: '1', local: local('1'), refreshOnly: true }]);
      enqueue([{ id: '1', local: local('1'), refreshOnly: true }]);
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(documents).toEqual([]);
    });
  });

  describe('keyed by the primary key (#248)', () => {
    // WooCommerce's trap: the primary key is a uuid, the backend id is numeric.
    type Product = { uuid: string; id: number; name: string; _deleted?: boolean };
    const product = (n: number, name = `local-${n}`): Product => ({ uuid: `u-${n}`, id: n, name });
    const byUuid = (doc: Product) => doc.uuid;

    it('the key option matches fetched documents by the primary key when doc.id differs; without it every entry is tombstoned', async () => {
      const remote = [product(1, 'remote-1'), product(2, 'remote-2')];
      const keyed = createReconcileFeed<Product>({ key: byUuid, fetchByIds: vi.fn(async () => remote) });
      keyed.enqueue([{ key: 'u-1', local: product(1) }, { key: 'u-2', local: product(2) }]);
      expect((await keyed.adapter.pull.handler(undefined, 100, context)).documents).toEqual([
        { ...remote[0], _deleted: false },
        { ...remote[1], _deleted: false },
      ]);

      // The trap the option prevents: matched by doc.id (1, 2), no uuid entry is found, so all are tombstoned.
      const byId = createReconcileFeed<Product>({ fetchByIds: vi.fn(async () => remote) });
      byId.enqueue([{ id: 'u-1', local: product(1) }, { id: 'u-2', local: product(2) }]);
      const { documents } = await byId.adapter.pull.handler(undefined, 100, context);
      expect(documents.map((doc) => doc._deleted)).toEqual([true, true]);
    });

    it('fetchByIds receives the queued entries, with local and remote, so a connector can map a uuid to its backend id', async () => {
      const fetchByIds = vi.fn(async (entries: Array<{ key: string; local?: Product; remote?: unknown }>) =>
        entries.map((e) => product(e.remote as number, `remote-${e.key}`)));
      const { adapter, enqueue } = createReconcileFeed<Product>({ key: byUuid, fetchByIds });
      enqueue([{ key: 'u-1', local: product(1), remote: 1 }, { key: 'u-7', remote: 7 }]);
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(fetchByIds).toHaveBeenCalledExactlyOnceWith(
        [{ key: 'u-1', local: product(1), remote: 1 }, { key: 'u-7', local: undefined, remote: 7 }],
        context,
      );
      expect(documents.map((doc) => [doc.uuid, doc._deleted])).toEqual([['u-1', false], ['u-7', false]]);
    });

    it('a tombstone entry is written as deleted from local without a fetch', async () => {
      const fetchByIds = vi.fn(async () => [product(1, 'remote-1')]);
      const { adapter, enqueue } = createReconcileFeed<Product>({ key: byUuid, fetchByIds });
      enqueue([{ key: 'u-1', local: product(1), tombstone: true }]);
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(documents).toEqual([{ ...product(1), _deleted: true }]);
      expect(fetchByIds).not.toHaveBeenCalled();
    });

    it('a fetched document keeps the _deleted: true that fetchByIds set (an unpublished product)', async () => {
      const fetchByIds = vi.fn(async () => [{ ...product(1, 'draft-1'), _deleted: true }]);
      const { adapter, enqueue } = createReconcileFeed<Product>({ key: byUuid, fetchByIds });
      enqueue([{ key: 'u-1', local: product(1) }]);
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(documents).toEqual([{ ...product(1, 'draft-1'), _deleted: true }]);
    });

    it('a missing refreshOnly entry is never tombstoned, and an entry with no local copy is skipped', async () => {
      const fetchByIds = vi.fn(async () => []);
      const { adapter, enqueue } = createReconcileFeed<Product>({ key: byUuid, fetchByIds });
      enqueue([{ key: 'u-1', local: product(1), refreshOnly: true }, { key: 'u-2', remote: 2 }]);
      const { documents } = await adapter.pull.handler(undefined, 100, context);
      expect(documents).toEqual([]);
    });

    describe('the remote option: a listing that carries no primary key (#313)', () => {
      const byId = (doc: Product) => doc.id;

      it('an entry with no local copy whose key finds nothing is matched by remote', async () => {
        const { adapter, enqueue } = createReconcileFeed<Product>({ key: byUuid, remote: byId, fetchByIds: vi.fn(async () => [product(7, 'remote-7')]) });
        enqueue([{ key: '7', remote: 7 }]);
        expect((await adapter.pull.handler(undefined, 100, context)).documents).toEqual([{ ...product(7, 'remote-7'), _deleted: false }]);
      });

      it('an entry with a local copy is never matched by remote: a missing product is tombstoned, not swapped', async () => {
        const other = { ...product(7, 'another'), uuid: 'u-other' };
        const { adapter, enqueue } = createReconcileFeed<Product>({ key: byUuid, remote: byId, fetchByIds: vi.fn(async () => [other]) });
        enqueue([{ key: 'u-7', local: product(7), remote: 7 }]);
        expect((await adapter.pull.handler(undefined, 100, context)).documents).toEqual([{ ...product(7), _deleted: true }]);
      });

      it('without remote, an entry with no local copy whose key finds nothing is dropped, as before', async () => {
        const { adapter, enqueue } = createReconcileFeed<Product>({ key: byUuid, fetchByIds: vi.fn(async () => [product(7, 'remote-7')]) });
        enqueue([{ key: '7', remote: 7 }]);
        expect((await adapter.pull.handler(undefined, 100, context)).documents).toEqual([]);
      });
    });
  });
});
