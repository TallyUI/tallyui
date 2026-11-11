// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { closeTills, createFakeStore, startTill } from '../__tests__/fake-store';
import { toProductDocument, WCPOS_UUID_META_KEY } from './products';

afterEach(closeTills);

/** WCPOS 1.10.20 adds this to every variable product, with an object value (#713). */
const variablePrices = {
  id: 601, key: '_woocommerce_pos_variable_prices',
  value: { price: { min: '20.00', max: '25.00' }, regular_price: { min: '20.00', max: '25.00' } },
};

describe('product meta_data with non-string values (#713)', () => {
  it('keeps only the string-valued entries, in order and unchanged', () => {
    const uuid = { id: 600, key: WCPOS_UUID_META_KEY, value: 'uuid-1' };
    const note = { id: 603, key: 'note', value: 'kept' };
    const document = toProductDocument({
      id: 1, status: 'publish', type: 'variable',
      meta_data: [uuid, variablePrices, { id: 602, key: 'list', value: ['a', 'b'] }, note, { id: 604, key: 'count', value: 3 }],
    });
    expect(document.meta_data).toEqual([uuid, note]);
    expect(document.uuid).toBe('uuid-1');
  });

  it('leaves meta_data absent when the product has none', () => {
    expect(toProductDocument({ id: 1, uuid: 'u1', status: 'publish' })).not.toHaveProperty('meta_data');
  });

  it('pulls a simple and a variable product into validating storage without the object meta', async () => {
    const store = createFakeStore(2);
    Object.assign(store.rows[1], {
      type: 'variable', variations: [],
      meta_data: [{ id: 605, key: WCPOS_UUID_META_KEY, value: 'u2' }, variablePrices],
    });
    const till = await startTill(store, { batchSize: 10 });
    await till.sync();
    const local = await till.local();
    expect([...local.keys()].sort()).toEqual(['u1', 'u2']);
    expect(local.get('u2').meta_data).toEqual([{ id: 605, key: WCPOS_UUID_META_KEY, value: 'u2' }]);
  });
});
