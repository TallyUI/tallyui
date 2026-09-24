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
});
