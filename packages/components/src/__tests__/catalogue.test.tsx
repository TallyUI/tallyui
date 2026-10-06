import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorProvider } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { Catalogue, formatStockSyncTime } from '../sale/catalogue';
import type { ProductGrid, ProductStockBadge } from '../product';

// Ported from medusapos/app `563b03c4` `tests/catalogue.test.tsx` (ADR-052, TV6b). Mocks the sibling
// product/input/ui modules the same way medusapos mocked `@tallyui/components`: the tile is composed
// directly in catalogue.tsx (ProductCard has no children slot), so only ProductTitle and ProductStockBadge
// need to render real content for the tests below.
vi.mock('../product', () => ({
  ProductGrid: ({ items, renderItem, emptyState, numColumns }: ComponentProps<typeof ProductGrid>) => (
    <div data-testid="grid" data-columns={numColumns}>
      {items.length ? items.map((item: { id: string }, index: number) => <div key={item.id}>{renderItem(item, index)}</div>) : emptyState}
    </div>
  ),
  ProductImage: () => null,
  ProductTitle: ({ doc }: { doc: { title?: ReactNode } }) => <span>{doc.title}</span>,
  ProductPrice: () => null,
  ProductStockBadge: ({ doc, showAsOf }: ComponentProps<typeof ProductStockBadge>) => (
    <span data-testid={`stock-badge-${doc.id}`} data-as-of={String(showAsOf)}>{traits.getStock(doc).status}</span>
  ),
}));
vi.mock('../input', () => ({
  SearchInput: ({ value, onChangeText, onSubmitEditing, placeholder, autoFocus }:
    { value: string; onChangeText: (text: string) => void; onSubmitEditing?: (event: unknown) => void; placeholder?: string; autoFocus?: boolean }) => (
    <input value={value} placeholder={placeholder} autoFocus={autoFocus}
      onChange={(event) => onChangeText(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter') onSubmitEditing?.({}); }} />
  ),
}));
vi.mock('../ui', () => ({
  VStack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const traits = medusaConnector.traits.product;
const products = [
  { id: 'hat', title: 'Blue Hat', status: 'published', variants: [
    { id: 'hat-one', title: 'One size', sku: 'LARGE-CODE', barcode: '111',
      prices: [{ amount: 10, currency_code: 'eur' }], manage_inventory: false },
  ] },
  { id: 'shirt', title: 'Red Shirt', status: 'published', variants: [
    { id: 'small', title: 'Small', sku: 'SHIRT-S', barcode: '222',
      prices: [{ amount: 20, currency_code: 'eur' }], manage_inventory: false },
    { id: 'large', title: 'Large', sku: 'SHIRT-L', barcode: 'LARGE-CODE',
      prices: [{ amount: 25, currency_code: 'eur' }], manage_inventory: true, inventory_quantity: 0 },
  ] },
];

afterEach(() => cleanup());

function mount(items = products, lastSyncedAt: Date | null = null, lastStockCheckAt: Date | null = null, hour12?: boolean, minCodeLength?: number) {
  const onSelect = vi.fn();
  render(<Catalogue products={items} traits={traits} currency="EUR" onSelect={onSelect} statusText="Synced"
    lastSyncedAt={lastSyncedAt} lastStockCheckAt={lastStockCheckAt} hour12={hour12} minCodeLength={minCodeLength} />);
  const input = screen.getByPlaceholderText('Search or scan barcode / SKU') as HTMLInputElement;
  return { input, onSelect };
}

// A dedicated product/variant pair per code length, used only by the minCodeLength tests below.
const scanCodes = [
  { id: 'scan', title: 'Scan Test', status: 'published', variants: [
    { id: 'scan-short', title: 'Short', sku: 'SHORT', barcode: 'ABCDE',
      prices: [{ amount: 5, currency_code: 'eur' }], manage_inventory: false },
    { id: 'scan-long', title: 'Long', sku: 'LONGCODE', barcode: 'ABCDEFGH',
      prices: [{ amount: 5, currency_code: 'eur' }], manage_inventory: false },
  ] },
];

describe('Catalogue', () => {
  it('follows a 24-hour device clock and drops AM/PM', () => {
    const time = new Date(2026, 8, 24, 10, 42);
    expect(formatStockSyncTime(time, 'en-US', false, time)).toBe('10:42');
  });
  it('follows a 12-hour device clock and keeps AM/PM', () => {
    const time = new Date(2026, 8, 24, 10, 42);
    expect(formatStockSyncTime(time, 'en-US', true, time)).toMatch(/^10:42[  ]?AM$/);
  });
  it('does not pad the hour on a 12-hour device clock', () => {
    const time = new Date(2026, 8, 24, 2, 49);
    const label = formatStockSyncTime(time, 'en-US', true, time);
    expect(label).toBe('2:49 AM');
    expect(label).not.toContain('02:49');
  });
  it('keeps the locale default when the device reports no clock preference', () => {
    const time = new Date(2026, 8, 24, 10, 42);
    expect(formatStockSyncTime(time, 'en-US', undefined, time)).toMatch(/^10:42[  ]?AM$/);
  });
  it('shows the time only when the time is on the same device-local day as now', () => {
    const time = new Date(2026, 8, 24, 16, 5);
    const now = new Date(2026, 8, 24, 23, 59);
    expect(formatStockSyncTime(time, 'en-US', false, now)).toBe('16:05');
  });
  it('adds a short date ahead of the time when the time is not on the same device-local day as now', () => {
    const time = new Date(2026, 8, 23, 16, 5);
    const now = new Date(2026, 8, 24, 0, 1);
    const dateLabel = time.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    expect(formatStockSyncTime(time, 'en-US', false, now)).toBe(`${dateLabel}, 16:05`);
  });
  // Not ported from medusapos: "shows the last successful sync time with each stock label
  // (uses24hourClock=%s)" drove Catalogue's own device-clock reading (expo-localization's
  // getCalendars()), which TV6b replaced with an `hour12` prop the app now computes and passes
  // in (ADR-052). Replaced by the test below, which checks the prop is threaded through.
  it('passes hour12 through to the stock-as-of time', () => {
    const time = new Date();
    time.setHours(10, 42, 0, 0);
    const expected12 = formatStockSyncTime(time, undefined, true, time);
    const expected24 = formatStockSyncTime(time, undefined, false, time);
    expect(expected12).not.toBe(expected24);
    mount(products, time, null, true);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    expect(within(screen.getByLabelText('Choose variant')).getByText(`In Stock · as of ${expected12}`)).toBeTruthy();
    cleanup();
    mount(products, time, null, false);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    expect(within(screen.getByLabelText('Choose variant')).getByText(`In Stock · as of ${expected24}`)).toBeTruthy();
  });
  it('dates stock by the later of the catalogue sync and the persisted stock check, checked later', () => {
    const synced = new Date('2026-09-24T09:15:00Z');
    const checked = new Date('2026-09-24T10:42:00Z');
    mount(products, synced, checked);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(`In Stock · as of ${formatStockSyncTime(checked)}`)).toBeTruthy();
    expect(chooser.queryByText(`In Stock · as of ${formatStockSyncTime(synced)}`)).toBeNull();
  });
  it('dates stock by the later of the catalogue sync and the persisted stock check, synced later', () => {
    const checked = new Date('2026-09-24T09:15:00Z');
    const synced = new Date('2026-09-24T10:42:00Z');
    mount(products, synced, checked);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(`In Stock · as of ${formatStockSyncTime(synced)}`)).toBeTruthy();
    expect(chooser.queryByText(`In Stock · as of ${formatStockSyncTime(checked)}`)).toBeNull();
  });
  it('shows a short date as well as the time when the winning sync is from yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mount(products, null, yesterday);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    const expected = formatStockSyncTime(yesterday);
    expect(expected).toContain(',');
    expect(chooser.getByText(`In Stock · as of ${expected}`)).toBeTruthy();
  });
  it("shows only the time when the winning sync is from today", () => {
    const today = new Date();
    mount(products, null, today);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    const expected = formatStockSyncTime(today);
    expect(expected).not.toContain(',');
    expect(chooser.getByText(`In Stock · as of ${expected}`)).toBeTruthy();
  });
  it('filters products through search and shows matching counts', () => {
    const { input } = mount();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'red' } });
    expect(screen.getByTestId('product-tile-Red Shirt')).toBeTruthy();
    expect(screen.queryByTestId('product-tile-Blue Hat')).toBeNull();
    expect(screen.getByText('Synced · 1 matching')).toBeTruthy();
  });
  it('submits a barcode across all variants, preferring it over another product SKU, and clears search', () => {
    const { input, onSelect } = mount();
    fireEvent.change(input, { target: { value: ' large-code ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      product: products[1], variant: traits.getVariants!(products[1])[1],
    });
    expect(input.value).toBe('');
    expect(screen.getByTestId('product-tile-Blue Hat')).toBeTruthy();
    expect(screen.getByTestId('product-tile-Red Shirt')).toBeTruthy();
  });
  it('leaves a code shorter than minCodeLength as a plain search, even though it matches', () => {
    const { input, onSelect } = mount(scanCodes, null, null, undefined, 8);
    fireEvent.change(input, { target: { value: 'ABCDE' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(input.value).toBe('ABCDE');
  });
  it('still does a code lookup at or above minCodeLength', () => {
    const { input, onSelect } = mount(scanCodes, null, null, undefined, 8);
    fireEvent.change(input, { target: { value: 'ABCDEFGH' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      product: scanCodes[0], variant: traits.getVariants!(scanCodes[0])[1],
    });
    expect(input.value).toBe('');
  });
  it('selects a short code as before when minCodeLength is unset', () => {
    const { input, onSelect } = mount(scanCodes);
    fireEvent.change(input, { target: { value: 'ABCDE' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      product: scanCodes[0], variant: traits.getVariants!(scanCodes[0])[0],
    });
    expect(input.value).toBe('');
  });
  it('does not count surrounding whitespace towards minCodeLength', () => {
    const { input, onSelect } = mount(scanCodes, null, null, undefined, 8);
    fireEvent.change(input, { target: { value: '   ABCDE   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(input.value).toBe('   ABCDE   ');
  });
  it('leaves an unknown code and its results intact', () => {
    const { input, onSelect } = mount();
    fireEvent.change(input, { target: { value: 'missing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(input.value).toBe('missing');
    expect(screen.getByText('No products match "missing".')).toBeTruthy();
  });
  it('selects a single variant by tapping its product', () => {
    const { onSelect } = mount();
    fireEvent.click(screen.getByTestId('product-tile-Blue Hat'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      product: products[0], variant: traits.getVariants!(products[0])[0],
    });
    expect(screen.queryByLabelText('Choose variant')).toBeNull();
  });
  it('shows variant details and lets an out-of-stock variant be selected', () => {
    const { onSelect } = mount();
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    expect(onSelect).not.toHaveBeenCalled();
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText('Small')).toBeTruthy();
    expect(chooser.getByText('SHIRT-L')).toBeTruthy();
    expect(chooser.getByText('€25.00')).toBeTruthy();
    expect(chooser.getByText('Out of Stock · not yet synced')).toBeTruthy();
    expect(chooser.getByText('In Stock · not yet synced')).toBeTruthy();
    fireEvent.click(chooser.getByRole('button', { name: /Large/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      product: products[1], variant: traits.getVariants!(products[1])[1],
    });
    expect(screen.queryByLabelText('Choose variant')).toBeNull();
  });
  it('closes the chooser on Cancel without selecting', () => {
    const { onSelect } = mount();
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Choose variant')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
  // medusapos ADR 0007: the open chooser derives from the current products, never a copy taken when it opened.
  it('re-renders an open chooser with the stock status of a new products prop', () => {
    const onSelect = vi.fn();
    const props = { traits, currency: 'EUR', onSelect, lastSyncedAt: null };
    const view = render(<Catalogue products={products} {...props} />);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const large = () => within(screen.getByLabelText('Choose variant')).getByRole('button', { name: /Large/ });
    expect(within(large()).getByText('Out of Stock · not yet synced')).toBeTruthy();
    const restocked = [products[0], { ...products[1], variants: [products[1].variants[0],
      { ...products[1].variants[1], inventory_quantity: 3 }] }];
    view.rerender(<Catalogue products={restocked} {...props} />);
    expect(within(large()).getByText('In Stock · not yet synced')).toBeTruthy();
    fireEvent.click(large());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      product: restocked[1], variant: traits.getVariants!(restocked[1])[1],
    });
  });
  it('closes an open chooser when its product leaves the catalogue', () => {
    const props = { traits, currency: 'EUR', onSelect: vi.fn(), lastSyncedAt: null };
    const view = render(<Catalogue products={products} {...props} />);
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    view.rerender(<Catalogue products={[products[0]]} {...props} />);
    expect(screen.queryByLabelText('Choose variant')).toBeNull();
    view.rerender(<Catalogue products={products} {...props} />);
    expect(screen.queryByLabelText('Choose variant')).toBeNull();
  });
  it('shows an empty catalogue', () => {
    mount([], new Date('2026-10-06T10:00:00Z'));
    expect(screen.getByText('No products yet.')).toBeTruthy();
  });
  it('says Loading products… on an empty grid before the first sync completes', () => {
    mount([]);
    expect(screen.getByText('Loading products…')).toBeTruthy();
    expect(screen.queryByText('No products yet.')).toBeNull();
  });
  it('a loading={false} override shows No products yet. even without a sync', () => {
    render(<Catalogue products={[]} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} loading={false} />);
    expect(screen.getByText('No products yet.')).toBeTruthy();
  });
  it('shows No products yet. after a failed first pull', () => {
    render(<Catalogue products={[]} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} pullError={new Error('offline')} />);
    expect(screen.getByText('No products yet.')).toBeTruthy();
    expect(screen.queryByText('Loading products…')).toBeNull();
  });
  it('still says Loading products… before the first sync with a null pullError', () => {
    render(<Catalogue products={[]} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} pullError={null} />);
    expect(screen.getByText('Loading products…')).toBeTruthy();
    expect(screen.queryByText('No products yet.')).toBeNull();
  });
  it('a loading={true} override says Loading products… even with a pullError', () => {
    render(<Catalogue products={[]} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} loading={true} pullError={new Error('offline')} />);
    expect(screen.getByText('Loading products…')).toBeTruthy();
    expect(screen.queryByText('No products yet.')).toBeNull();
  });
  it('still shows the no-match message while loading', () => {
    const { input } = mount([]);
    fireEvent.change(input, { target: { value: 'missing' } });
    expect(screen.getByText('No products match "missing".')).toBeTruthy();
  });
  it('renders a stock badge on every tile from the tile\'s own (already-overlaid) product, without an "as of"', () => {
    const soldOut = { id: 'boots', title: 'Green Boots', status: 'published', variants: [
      { id: 'boots-one', title: 'One size', sku: 'BOOTS', barcode: '333',
        prices: [{ amount: 40, currency_code: 'eur' }], manage_inventory: true, inventory_quantity: 0 },
    ] };
    mount([...products, soldOut]);
    const hatBadge = screen.getByTestId('stock-badge-hat');
    expect(hatBadge.textContent).toBe('in_stock');
    expect(hatBadge.getAttribute('data-as-of')).toBe('false');
    const bootsBadge = screen.getByTestId('stock-badge-boots');
    expect(bootsBadge.textContent).toBe('out_of_stock');
    expect(bootsBadge.getAttribute('data-as-of')).toBe('false');
  });
  it('uses the catalogue pane width for two to six columns with room for 160 px tiles', () => {
    mount();
    const grid = screen.getByTestId('grid');
    const pane = grid.parentElement as HTMLElement & {
      __reactLayoutHandler: (event: { nativeEvent: { layout: { width: number } } }) => void;
    };
    expect(grid.getAttribute('data-columns')).toBe('2');
    for (const [width, columns] of [[300, 2], [511, 2], [512, 3], [680, 4], [848, 5], [1016, 6], [1600, 6], [400, 2]]) {
      act(() => pane.__reactLayoutHandler({ nativeEvent: { layout: { width } } }));
      expect(grid.getAttribute('data-columns')).toBe(String(columns));
    }
  });
  // The Front desk review (2026-09-28): an app puts a register control at the end of the status
  // row, at phone width, without disturbing the status text's own layout.
  it('renders the status accessory at the end of the status row, alongside the status text', () => {
    render(
      <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} statusText="Synced"
        statusAccessory={<span data-testid="accessory">Register</span>} lastSyncedAt={null} />,
    );
    const row = screen.getByTestId('catalogue-status-row');
    expect(within(row).getByText('Synced')).toBeTruthy();
    expect(within(row).getByTestId('accessory')).toBeTruthy();
  });
  it('renders the status accessory on its own row when there is no status text', () => {
    render(
      <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()}
        statusAccessory={<span data-testid="accessory">Register</span>} lastSyncedAt={null} />,
    );
    expect(within(screen.getByTestId('catalogue-status-row')).getByTestId('accessory')).toBeTruthy();
  });
  it('renders no status row without either statusText or statusAccessory', () => {
    render(<Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} />);
    expect(screen.queryByTestId('catalogue-status-row')).toBeNull();
  });
  // Front desk review of medusapos #88: with an accessory (e.g. a register pill) at phone width, the
  // status text wrapped to three lines and pushed the accessory out of place. react-native-web renders
  // Text's numberOfLines={1} as a single-line, ellipsis-truncated element in this jsdom harness (observed
  // via getComputedStyle: textOverflow: 'ellipsis', whiteSpace: 'nowrap'); without it, whiteSpace is 'pre-wrap'.
  it('keeps the status text to one line when an accessory is present, and wraps as before without one', () => {
    const { rerender } = render(
      <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} statusText="Synced"
        statusAccessory={<span data-testid="accessory">Register</span>} lastSyncedAt={null} />,
    );
    const withAccessory = within(screen.getByTestId('catalogue-status-row')).getByText('Synced');
    expect(getComputedStyle(withAccessory).textOverflow).toBe('ellipsis');
    expect(getComputedStyle(withAccessory).whiteSpace).toBe('nowrap');

    rerender(
      <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} statusText="Synced"
        lastSyncedAt={null} />,
    );
    const withoutAccessory = within(screen.getByTestId('catalogue-status-row')).getByText('Synced');
    expect(getComputedStyle(withoutAccessory).textOverflow).not.toBe('ellipsis');
    expect(getComputedStyle(withoutAccessory).whiteSpace).toBe('pre-wrap');
  });
  // ADR-060: reconciled stock reaches Catalogue's own entries (not just ProductStockBadge's tiles)
  // through useStockOverlaid, so the chooser agrees with a reconcile pass the raw product hasn't seen yet.
  it('applies a ConnectorProvider stock overlay to the chooser, even though the raw product is in stock', () => {
    const overlayDoc = { id: 'shirt', title: 'Red Shirt', status: 'published', variants: [
      { id: 'small', title: 'Small', sku: 'SHIRT-S', barcode: '222', prices: [{ amount: 20, currency_code: 'eur' }], manage_inventory: false },
      { id: 'large', title: 'Large', sku: 'SHIRT-L', barcode: 'LARGE-CODE', prices: [{ amount: 25, currency_code: 'eur' }],
        manage_inventory: true, inventory_items: [{ inventory_item_id: 'inv-large', required_quantity: 1,
          inventory: { location_levels: [{ stocked_quantity: 5, reserved_quantity: 0 }] } }] },
    ] };
    expect(traits.getVariants!(overlayDoc)[1].stock.status).toBe('in_stock');
    const overlay = new Map([['inv-large', [{ stocked_quantity: 0, reserved_quantity: 0 }]]]);
    render(
      <ConnectorProvider connector={medusaConnector} stockOverlay={overlay}>
        <Catalogue products={[overlayDoc]} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(/^Out of Stock/)).toBeTruthy();
  });
  it('selects the overlaid variant on an exact-code scan', () => {
    const overlayDoc = { id: 'shirt', title: 'Red Shirt', status: 'published', variants: [
      { id: 'large', title: 'Large', sku: 'SHIRT-L', barcode: 'LARGE-CODE', prices: [{ amount: 25, currency_code: 'eur' }],
        manage_inventory: true, inventory_items: [{ inventory_item_id: 'inv-large', required_quantity: 1,
          inventory: { location_levels: [{ stocked_quantity: 5, reserved_quantity: 0 }] } }] },
    ] };
    expect(traits.getVariants!(overlayDoc)[0].stock.status).toBe('in_stock');
    const overlay = new Map([['inv-large', [{ stocked_quantity: 0, reserved_quantity: 0 }]]]);
    const onSelect = vi.fn();
    render(
      <ConnectorProvider connector={medusaConnector} stockOverlay={overlay}>
        <Catalogue products={[overlayDoc]} traits={traits} currency="EUR" onSelect={onSelect} lastSyncedAt={null} />
      </ConnectorProvider>,
    );
    const input = screen.getByPlaceholderText('Search or scan barcode / SKU');
    fireEvent.change(input, { target: { value: 'LARGE-CODE' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      variant: expect.objectContaining({ stock: expect.objectContaining({ status: 'out_of_stock' }) }),
    }));
  });
  it('shows the provider time as the "as of" time when lastStockCheckAt is null but the provider time is newer', () => {
    const synced = new Date('2026-09-24T09:15:00Z');
    const providerAsOf = new Date('2026-09-24T10:42:00Z');
    render(
      <ConnectorProvider connector={medusaConnector} stockOverlayAsOf={providerAsOf.toISOString()}>
        <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={synced} lastStockCheckAt={null} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(`In Stock · as of ${formatStockSyncTime(providerAsOf)}`)).toBeTruthy();
  });
  it('falls back to the provider stockOverlayAsOf for the as-of label when lastStockCheckAt is not given', () => {
    const asOf = new Date('2026-09-24T10:42:00Z');
    render(
      <ConnectorProvider connector={medusaConnector} stockOverlayAsOf={asOf.toISOString()}>
        <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(`In Stock · as of ${formatStockSyncTime(asOf)}`)).toBeTruthy();
  });
  it('prefers a newer provider time over an older lastStockCheckAt', () => {
    const checked = new Date('2026-09-24T09:15:00Z');
    const providerAsOf = new Date('2026-09-24T10:42:00Z');
    render(
      <ConnectorProvider connector={medusaConnector} stockOverlayAsOf={providerAsOf.toISOString()}>
        <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} lastStockCheckAt={checked} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(`In Stock · as of ${formatStockSyncTime(providerAsOf)}`)).toBeTruthy();
  });
  it('ignores an older provider time in favour of lastStockCheckAt', () => {
    const checked = new Date('2026-09-24T10:42:00Z');
    const providerAsOf = new Date('2026-09-24T09:15:00Z');
    render(
      <ConnectorProvider connector={medusaConnector} stockOverlayAsOf={providerAsOf.toISOString()}>
        <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} lastStockCheckAt={checked} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(`In Stock · as of ${formatStockSyncTime(checked)}`)).toBeTruthy();
  });
  it('ignores an invalid provider stockOverlayAsOf string', () => {
    const checked = new Date('2026-09-24T10:42:00Z');
    render(
      <ConnectorProvider connector={medusaConnector} stockOverlayAsOf="not-a-date">
        <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} lastStockCheckAt={checked} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText(`In Stock · as of ${formatStockSyncTime(checked)}`)).toBeTruthy();
  });
  it('ignores the provider time when the connector has no reconcile.stock', () => {
    const providerAsOf = new Date('2026-09-24T10:42:00Z');
    const connectorNoStock = { ...medusaConnector, reconcile: undefined } as typeof medusaConnector;
    render(
      <ConnectorProvider connector={connectorNoStock} stockOverlayAsOf={providerAsOf.toISOString()}>
        <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Red Shirt'));
    const chooser = within(screen.getByLabelText('Choose variant'));
    expect(chooser.getByText('In Stock · not yet synced')).toBeTruthy();
  });
});
