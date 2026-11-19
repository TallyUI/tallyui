// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as entry from '../index';
import { DEFAULT_TILE_FIELDS, normalizeTileFields, TILE_FIELDS } from './tile-fields';

const TODAY = { name: true, price: true, onSale: true, categories: false, sku: false, barcode: false, stock: true };

describe('tile fields', () => {
  it("defaults to today's tile, in TILE_FIELDS order, frozen", () => {
    expect(DEFAULT_TILE_FIELDS).toStrictEqual(TODAY);
    expect(Object.keys(DEFAULT_TILE_FIELDS)).toEqual([...TILE_FIELDS]);
    expect(Object.isFrozen(DEFAULT_TILE_FIELDS)).toBe(true);
  });

  it('merges a partial object onto the defaults', () => {
    expect(normalizeTileFields({ sku: true, name: false })).toStrictEqual({ ...TODAY, sku: true, name: false });
    expect(normalizeTileFields({})).toStrictEqual(TODAY);
  });

  it('drops unknown keys and falls back for non-boolean fields', () => {
    expect(normalizeTileFields({ sku: 'yes', price: 0, tax: true, extra: 1 })).toStrictEqual(TODAY);
  });

  it('gives undefined for anything but a plain object', () => {
    for (const value of [null, undefined, [], [true], 'name', 1, true]) {
      expect(normalizeTileFields(value)).toBeUndefined();
    }
  });

  it('keeps TILE_FIELDS order in the result', () => {
    expect(Object.keys(normalizeTileFields({ stock: false, name: false })!)).toEqual([...TILE_FIELDS]);
  });

  it('is exported from the package entry', () => {
    expect(entry.TILE_FIELDS).toBe(TILE_FIELDS);
    expect(entry.DEFAULT_TILE_FIELDS).toBe(DEFAULT_TILE_FIELDS);
    expect(entry.normalizeTileFields).toBe(normalizeTileFields);
    const fields: entry.TileFields = entry.DEFAULT_TILE_FIELDS;
    const field: entry.TileField = entry.TILE_FIELDS[0];
    expect(fields[field]).toBe(true);
  });
});
