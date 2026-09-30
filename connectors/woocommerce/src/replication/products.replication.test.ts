// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at, closeTills, createFakeStore, stamp, startTill, type FakeRow } from '../__tests__/fake-store';

afterEach(closeTills);

// The shared fake store (see its header) and a till replicating through the connector's combined pull
// (the product feed and the reconcile feed), so every case here also proves the combined wiring.
async function setup(size: number, { total = true, filter = true, utcOffset = 0, afterCall = (_call: number, _rows: FakeRow[]) => {} } = {}) {
  const store = createFakeStore(size, { total, filter, zone: utcOffset });
  return { rows: store.rows, ...(await startTill(store, { afterCall })) };
}

describe('WooCommerce product pass cursor in the real RxDB replication loop', () => {
  it('keeps every product and keeps syncing when already-read products are trashed during the pass', async () => {
    // The reviewer's u6 case: the lowest-id product, already read, is trashed after each of the first four handler calls.
    const { rows, poll, sync, local } = await setup(10, { afterCall: (call, rows) => { if (call <= 4) rows.shift(); } });
    await sync();
    for (let i = 0; i < 10; i++) await poll();

    const synced = await local();
    expect(rows.map((p) => p.uuid).filter((uuid) => !synced.has(uuid))).toEqual([]);

    Object.assign(rows.find((p) => p.id === 8)!, { name: 'Edited', ...at(stamp(30)) });
    await poll();
    expect((await local()).get('u8')?.name).toBe('Edited');
  });

  it('has every remaining product by poll 10 when trashes on every handler call stop after poll 3', async () => {
    let polls = 1;
    const { rows, poll, sync, local } = await setup(20, { afterCall: (_call, rows) => { if (polls <= 3) rows.shift(); } });
    await sync();
    for (polls = 2; polls <= 10; polls++) await poll();

    expect(rows.length).toBeLessThan(18);
    const synced = await local();
    expect(rows.map((p) => p.uuid).filter((uuid) => !synced.has(uuid))).toEqual([]);
  });

  it('receives an edit on the next poll without X-WP-Total when the catalogue is a multiple of the batch size', async () => {
    const { rows, poll, sync, local } = await setup(4, { total: false });
    await sync();
    expect([...(await local()).keys()].sort()).toEqual(['u1', 'u2', 'u3', 'u4']);

    Object.assign(rows[0], { name: 'Edited', ...at(stamp(30)) });
    await poll();
    expect((await local()).get('u1')?.name).toBe('Edited');
  });

  it('a product edited in a repeated daylight-saving hour reaches the till on the next poll', async () => {
    const { rows, poll, sync, local } = await setup(3);
    await sync();
    // Lower bound L = stamp(3). A: local time an hour ahead (before the clocks went back), GMT time below L.
    // B: edited after the clocks went back, so its GMT time is above L but its local time is earlier than A's.
    Object.assign(rows[0], { name: 'A', ...at(stamp(2), 1) });
    Object.assign(rows[1], { name: 'B', ...at(stamp(30)) });
    expect(rows[0].date_modified > rows[1].date_modified && rows[0].date_modified_gmt < stamp(3)).toBe(true);

    await poll();
    expect((await local()).get('u2')?.name).toBe('B');
  });

  it('a quiet poll after a completed pass costs one request', async () => {
    const { sync, pollCost } = await setup(4);
    await sync();

    expect(await pollCost()).toBe(1);
    expect(await pollCost()).toBe(1);
  });

  it('a quiet poll after the most recently edited product is trashed costs one request', async () => {
    const { rows, sync, pollCost } = await setup(4);
    await sync();
    rows.pop();

    expect(await pollCost()).toBe(1);
    expect(await pollCost()).toBe(1);
  });

  it('a quiet poll on a store with no products costs one request', async () => {
    const { sync, local, pollCost } = await setup(0);
    await sync();

    expect(await pollCost()).toBe(1);
    expect(await pollCost()).toBe(1);
    expect((await local()).size).toBe(0);
  });

  it('a store at UTC+02:00 filters on the GMT digits the connector sends', async () => {
    const { rows, poll, sync, local } = await setup(3, { utcOffset: 2 });
    await sync();

    Object.assign(rows[0], { name: 'Edited', ...at(stamp(30), 2) });
    await poll();
    expect((await local()).get('u1')?.name).toBe('Edited');
  });

  it('a store that ignores modified_after surfaces WooDateFilterError instead of syncing silently', async () => {
    const { sync, state, errors } = await setup(3, { filter: false });
    await sync();

    // A quiet poll: the pull handler throws on every retry, so wait for the error rather than for the poll to settle.
    state.reSync();
    await vi.waitFor(() => expect(errors).not.toEqual([]));
    expect((errors[0] as any).parameters.errors[0]).toMatchObject({ name: 'WooDateFilterError', code: 'unsupported_store' });
  });
});
