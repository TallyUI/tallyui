import { describe, expect, it } from 'vitest';
import { catalogueViewReducer, normalizeCatalogueViewState, resolveGridColumns, DEFAULT_CATALOGUE_VIEW_STATE,
  type CatalogueViewState } from './catalogue-view-state';

const defaults = DEFAULT_CATALOGUE_VIEW_STATE;
describe('catalogueViewReducer', () => {
  it('has frozen grid, auto and unsorted defaults', () => {
    expect(defaults).toEqual({ view: 'grid', gridColumns: 'auto', sort: null });
    expect(Object.isFrozen(defaults)).toBe(true);
  });
  it('changes each field without mutating the input', () => {
    expect(catalogueViewReducer(defaults, { type: 'setView', view: 'table' })).toEqual({ ...defaults, view: 'table' });
    expect(catalogueViewReducer(defaults, { type: 'setGridColumns', gridColumns: 4 })).toEqual({ ...defaults, gridColumns: 4 });
    const sort = { field: 'name', dir: 'asc' } as const;
    const sorted = catalogueViewReducer(defaults, { type: 'setSort', sort });
    expect(sorted).toEqual({ ...defaults, sort });
    expect(catalogueViewReducer(sorted, { type: 'setSort', sort: null })).toEqual(defaults);
    expect(catalogueViewReducer(sorted, { type: 'setSort', sort: { ...sort, dir: 'desc' } })).not.toBe(sorted);
    expect(catalogueViewReducer(sorted, { type: 'setSort', sort: { ...sort, field: 'price' } })).not.toBe(sorted);
  });
  it('returns the same object for unchanged fields, including equal sorts', () => {
    expect(catalogueViewReducer(defaults, { type: 'setView', view: 'grid' })).toBe(defaults);
    expect(catalogueViewReducer(defaults, { type: 'setGridColumns', gridColumns: 'auto' })).toBe(defaults);
    expect(catalogueViewReducer(defaults, { type: 'setSort', sort: null })).toBe(defaults);
    const state: CatalogueViewState = { ...defaults, sort: { field: 'name', dir: 'asc' } };
    expect(catalogueViewReducer(state, { type: 'setSort', sort: { field: 'name', dir: 'asc' } })).toBe(state);
  });
  it('replaces with the supplied object, including an equal one', () => {
    const state = { ...defaults };
    expect(catalogueViewReducer(defaults, { type: 'replace', state })).toBe(state);
  });
});

describe('normalizeCatalogueViewState', () => {
  it.each([undefined, null, false, 2, 'grid', () => null])('defaults a non-object %s', (raw) => {
    expect(normalizeCatalogueViewState(raw)).toBe(defaults);
  });
  const valid: CatalogueViewState = { view: 'table', gridColumns: 4, sort: { field: 'name', dir: 'desc' } };
  it('defaults only missing or invalid fields and drops extra keys', () => {
    expect(normalizeCatalogueViewState({})).toEqual(defaults);
    expect(normalizeCatalogueViewState({ ...valid, view: 'list' })).toEqual({ ...valid, view: 'grid' });
    expect(normalizeCatalogueViewState({ ...valid, gridColumns: undefined })).toEqual({ ...valid, gridColumns: 'auto' });
    expect(normalizeCatalogueViewState({ ...valid, sort: undefined })).toEqual({ ...valid, sort: null });
    expect(normalizeCatalogueViewState({ ...valid, extra: true, sort: { ...valid.sort, extra: true } })).toEqual(valid);
  });
  it.each([1, 9, 2.5, '4'])('rejects gridColumns %s', (gridColumns) => {
    expect(normalizeCatalogueViewState({ ...valid, gridColumns })).toEqual({ ...valid, gridColumns: 'auto' });
  });
  it.each([2, 3, 4, 5, 6, 7, 8, 'auto'])('accepts gridColumns %s', (gridColumns) => {
    expect(normalizeCatalogueViewState({ gridColumns }).gridColumns).toBe(gridColumns);
  });
  it.each([false, 'name', {}, { field: '', dir: 'asc' }, { field: 2, dir: 'asc' }, { field: 'name', dir: 'up' }])('rejects invalid sort %j', (sort) => {
    expect(normalizeCatalogueViewState({ ...valid, sort })).toEqual({ ...valid, sort: null });
  });
  it('uses custom defaults field by field while accepting null sort', () => {
    expect(normalizeCatalogueViewState(null, valid)).toBe(valid);
    expect(normalizeCatalogueViewState({ view: 'grid', gridColumns: 9, sort: false }, valid)).toEqual({ ...valid, view: 'grid' });
    expect(normalizeCatalogueViewState({ sort: null }, valid)).toEqual({ ...valid, sort: null });
  });
  it('never throws on inaccessible stored fields', () => {
    expect(normalizeCatalogueViewState({ get view() { throw new Error('unreadable'); } })).toBe(defaults);
  });
});

describe('resolveGridColumns', () => {
  it.each([[300, 2], [700, 4], [2000, 6]])('preserves the auto formula at width %s', (width, expected) => {
    expect(resolveGridColumns('auto', width)).toBe(expected);
  });
  it('returns a fixed count irrespective of width', () => {
    expect(resolveGridColumns(8, 300)).toBe(8);
  });
});
