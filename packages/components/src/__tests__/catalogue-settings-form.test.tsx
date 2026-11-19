import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_TILE_FIELDS, type CatalogueGridColumns, type TileFields } from '@tallyui/pos';
import { CatalogueSettingsForm } from '../sale/catalogue-settings-form';
import { I18nProvider } from '../i18n';

afterEach(cleanup);

interface Options { gridColumns?: CatalogueGridColumns; tileFields?: Partial<TileFields>; showReset?: boolean }

const show = (options: Options = {}, wrap: (children: ReactElement) => ReactElement = (children) => children) => {
  const onGridColumnsChange = vi.fn();
  const onTileFieldsChange = vi.fn();
  render(wrap(
    <CatalogueSettingsForm {...options} onGridColumnsChange={onGridColumnsChange} onTileFieldsChange={onTileFieldsChange} />,
  ));
  return { onGridColumnsChange, onTileFieldsChange };
};
const fieldSwitches = () => screen.getAllByTestId(/^catalogue-settings-field-/);
const checked = (id: string) => screen.getByTestId(id).getAttribute('aria-checked');

describe('CatalogueSettingsForm', () => {
  it('CS1: Auto is on, no slider, and seven field switches in v2 order with today\'s tile checked', () => {
    show();
    expect(checked('catalogue-settings-auto')).toBe('true');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByTestId('catalogue-settings-tile-size')).toBeNull();
    expect(fieldSwitches().map((s) => s.getAttribute('data-testid'))).toEqual(
      ['name', 'price', 'onSale', 'categories', 'sku', 'barcode', 'stock'].map((f) => `catalogue-settings-field-${f}`));
    expect(fieldSwitches().map((s) => s.getAttribute('aria-label'))).toEqual(
      ['Product Name', 'Price', 'On Sale', 'Categories', 'SKU', 'Barcode', 'Stock']);
    expect(fieldSwitches().map((s) => s.getAttribute('aria-checked'))).toEqual(
      ['true', 'true', 'true', 'false', 'false', 'false', 'true']);
  });

  it('CS2: a field switch emits a fresh, full TileFields once and leaves the prop unchanged', () => {
    const tileFields: Partial<TileFields> = { name: false };
    const before = structuredClone(tileFields);
    const { onTileFieldsChange } = show({ tileFields });
    fireEvent.click(screen.getByTestId('catalogue-settings-field-sku'));
    expect(onTileFieldsChange).toHaveBeenCalledTimes(1);
    expect(onTileFieldsChange).toHaveBeenCalledWith({ ...DEFAULT_TILE_FIELDS, name: false, sku: true });
    expect(onTileFieldsChange.mock.calls[0][0]).not.toBe(tileFields);
    expect(tileFields).toEqual(before);
  });

  it('CS3: turning Auto off emits 4; the slider runs 2 to 8 and ArrowRight emits the next size', () => {
    const auto = show({ gridColumns: 'auto' });
    fireEvent.click(screen.getByTestId('catalogue-settings-auto'));
    expect(auto.onGridColumnsChange).toHaveBeenLastCalledWith(4);
    cleanup();
    const four = show({ gridColumns: 4 });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('4');
    expect(slider.getAttribute('aria-valuemin')).toBe('2');
    expect(slider.getAttribute('aria-valuemax')).toBe('8');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(four.onGridColumnsChange).toHaveBeenLastCalledWith(5);
  });

  it('CS4: turning Auto on emits auto', () => {
    const { onGridColumnsChange } = show({ gridColumns: 6 });
    expect(checked('catalogue-settings-auto')).toBe('false');
    fireEvent.click(screen.getByTestId('catalogue-settings-auto'));
    expect(onGridColumnsChange).toHaveBeenLastCalledWith('auto');
  });

  it('CS5: Restore Default Settings is drawn only with showReset, and emits auto and DEFAULT_TILE_FIELDS', () => {
    show({ gridColumns: 3, tileFields: { sku: true } });
    expect(screen.queryByTestId('catalogue-settings-reset')).toBeNull();
    cleanup();
    const { onGridColumnsChange, onTileFieldsChange } = show({ gridColumns: 3, tileFields: { sku: true }, showReset: true });
    fireEvent.click(screen.getByTestId('catalogue-settings-reset'));
    expect(onGridColumnsChange).toHaveBeenLastCalledWith('auto');
    expect(onTileFieldsChange).toHaveBeenLastCalledWith(DEFAULT_TILE_FIELDS);
    expect(onTileFieldsChange.mock.calls[0][0]).toEqual(DEFAULT_TILE_FIELDS);
  });

  it('CS6: the Tile Fields heading goes through the catalogue', () => {
    show({}, (children) => (
      <I18nProvider locale="fr" resources={{ fr: { 'common.tile_fields': 'Champs' } }}>{children}</I18nProvider>
    ));
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Tile Size', 'Champs']);
    expect(screen.queryByText('Tile Fields')).toBeNull();
  });
});
