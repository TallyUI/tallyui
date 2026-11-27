import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated, UIManager } from 'react-native';
import { medusaConnector } from '@tallyui/connector-medusa';
import { DEFAULT_CATALOGUE_VIEW_STATE } from '@tallyui/pos';
import { Catalogue } from '../sale/catalogue';
import type { ProductGrid } from '../product';

// The grid and the search box as catalogue-category-browse.test.tsx mocks them; CategoryTile is real.
vi.mock('../product', () => ({
  ProductGrid: ({ items, renderItem, emptyState }: ComponentProps<typeof ProductGrid>) => (
    <div data-testid="grid">{items.length ? items.map((item: { id: string }, index: number) => <div key={item.id}>{renderItem(item, index)}</div>) : emptyState}</div>
  ),
  ProductImage: () => null,
  ProductTitle: ({ doc }: { doc: { title?: ReactNode } }) => <span>{doc.title}</span>,
  ProductPrice: () => null,
  ProductStockBadge: () => null,
  // D12/D13 only: a toggle that switches to the table, and the table as a marker.
  ViewToggle: ({ value, onChange }: { value: string; onChange: (view: string) => void }) => (
    <button data-testid="view-toggle" data-value={value} onClick={() => onChange('table')} />
  ),
  ProductTable: () => <div data-testid="table" />,
}));
vi.mock('../input', () => ({
  SearchInput: ({ value, onChangeText, placeholder }: { value: string; onChangeText: (text: string) => void; placeholder?: string }) => (
    <input value={value} placeholder={placeholder} onChange={(event) => onChangeText(event.target.value)} />
  ),
}));
vi.mock('../ui', () => ({ VStack: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));

const traits = medusaConnector.traits.product;
const mugs = { id: 'pcat_mugs', name: 'Mugs' };
const hats = { id: 'pcat_hats', name: 'Hats' };
const make = (n: number, category = mugs) => Array.from({ length: n }, (_, i) => ({
  id: `${category.id}-${i}`, title: `${category.name} ${i}`, status: 'published', categories: [category],
  variants: [{ id: `${category.id}-v${i}`, title: 'One', prices: [{ amount: 5, currency_code: 'eur' }], manage_inventory: false }],
}));
const props = { traits, currency: 'EUR', onSelect: vi.fn(), lastSyncedAt: null, showCategoryNav: true, categoryBrowse: 'tiles' as const };

type Measure = (node: HTMLElement, done: (x: number, y: number, w: number, h: number) => void) => void;
// A root tile's box sits at (500, 300); every dealt cell at (10, 20).
const frames: Measure = (node, done) => node.querySelector('[data-testid^="category-tile-"]') && !node.closest('[data-testid="grid"]')
  ? done(500, 300, 120, 120) : done(10, 20, 120, 120);
const timings = () => vi.mocked(Animated.timing).mock.calls.map(([, config]) => config as Animated.TimingAnimationConfig);
const outs = () => timings().filter((config) => config.toValue === 1);
const homes = () => timings().filter((config) => config.toValue === 0);
const show = async (products: unknown[], extra: Partial<ComponentProps<typeof Catalogue>> = {}) => {
  await act(async () => { render(<Catalogue {...props} products={products} {...extra} />); });
};
const tap = (id: string) => act(() => { fireEvent.click(screen.getByTestId(`category-tile-${id}`)); });
const crumb = () => act(() => { fireEvent.click(screen.getByTestId('category-crumb-root')); });
// The `start` of each out timing (toValue 1), read from the spy's results.
const outStarts = () => vi.mocked(Animated.timing).mock.calls.flatMap(([, config], i) => ((config as Animated.TimingAnimationConfig).toValue === 1
  ? [(vi.mocked(Animated.timing).mock.results[i].value as { start: ReturnType<typeof vi.fn> }).start] : []));

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing').mockImplementation(() => ({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() }) as never);
  vi.spyOn(UIManager, 'measureInWindow').mockImplementation(frames as never);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('category deal', () => {
  it('D1: a tap deals the parent over PANE and each tile on the 22ms beat', async () => {
    await show(make(4));
    tap('pcat_mugs');
    expect(outs()[0]).toMatchObject({ toValue: 1, duration: 280, delay: 0 });
    expect(outs()[3]).toMatchObject({ toValue: 1, duration: 220, delay: 44 });
    expect(outs()).toHaveLength(5);
  });

  it('D2: the stagger caps at eight tiles', async () => {
    await show(make(12));
    tap('pcat_mugs');
    expect(outs()[9].delay).toBe(154);
    expect(outs()[12].delay).toBe(154);
  });

  for (const [path, leave] of [
    ['crumb', crumb],
    ['Escape', () => act(() => { fireEvent.keyDown(screen.getByTestId('category-crumb-root'), { key: 'Escape' }); })],
    ['parent tile', () => act(() => { fireEvent.click(screen.getByTestId('category-level-parent')); })],
  ] as const) {
    it(`D3/D11: back by the ${path} gathers, and the root returns at 280ms, not before`, async () => {
      vi.useFakeTimers();
      await show(make(3));
      tap('pcat_mugs');
      leave();
      expect(homes()[0]).toMatchObject({ toValue: 0, duration: 280, delay: 0 });
      expect(homes()[1]).toMatchObject({ toValue: 0, duration: 140 });
      act(() => { vi.advanceTimersByTime(279); });
      expect(screen.queryByTestId('category-browse')).toBeNull();
      expect(screen.getByTestId('category-crumb')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByTestId('category-browse')).toBeTruthy();
      expect(screen.queryByTestId('category-crumb')).toBeNull();
    });
  }

  it('D4: last out is first home (five cells: the parent and four tiles)', async () => {
    await show(make(4));
    tap('pcat_mugs');
    crumb();
    expect(homes().map((config) => config.delay)).toEqual([0, 30, 20, 10, 0]);
  });

  for (const [label, reduced] of [['on', Promise.resolve(true)], ['not known yet', new Promise<boolean>(() => {})]] as const) {
    it(`${label === 'on' ? 'D5' : 'D6'}: reduced motion ${label} deals nothing and goes back at once`, async () => {
      vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(reduced);
      await show(make(3));
      tap('pcat_mugs');
      expect(screen.getByTestId('category-level-parent').parentElement!.style.opacity).not.toBe('0');
      crumb();
      expect(screen.getByTestId('category-browse')).toBeTruthy();
      expect(Animated.timing).not.toHaveBeenCalled();
    });
  }

  it('D7: a stored category rests in place, and its back is at once', async () => {
    await show(make(3), { loadViewState: () => ({ categoryId: 'pcat_mugs' }) });
    expect(screen.getByTestId('category-level-parent').parentElement!.style.opacity).not.toBe('0');
    expect(Animated.timing).not.toHaveBeenCalled();
    crumb();
    expect(screen.getByTestId('category-browse')).toBeTruthy();
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('D8: a search clears into a level that was not dealt: its back is at once', async () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const at = (categoryId: string | null) => <Catalogue {...props} products={make(3)} onStateChange={changed}
      viewState={{ ...DEFAULT_CATALOGUE_VIEW_STATE, categoryId }} />;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(at(null)); });
    tap('pcat_mugs');
    view.rerender(at('pcat_mugs'));
    const search = (value: string) => act(() => {
      fireEvent.change(screen.getByPlaceholderText('Search or scan barcode / SKU'), { target: { value } });
    });
    // The search leaves the dealt level at once (L5), then a restored view state opens a level under it.
    search('zzz');
    view.rerender(at(null));
    act(() => { vi.advanceTimersByTime(0); });
    view.rerender(at('pcat_mugs'));
    search('');
    expect(screen.getByTestId('category-level-parent')).toBeTruthy();
    vi.mocked(Animated.timing).mockClear();
    changed.mockClear();
    crumb();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: null }));
    expect(homes()).toHaveLength(0);
  });

  it('D9: a frame that never comes shows the level in place after 120ms', async () => {
    vi.useFakeTimers();
    vi.mocked(UIManager.measureInWindow).mockImplementation(() => {});
    await show(make(3));
    tap('pcat_mugs');
    expect(screen.getByTestId('category-level-parent')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.getByTestId('category-level-parent').parentElement!.style.opacity).not.toBe('0');
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('D10: after a gather the other root tiles fade in over CROSSFADE; the returned tile shows at once', async () => {
    vi.useFakeTimers();
    await show([...make(2), ...make(2, hats)]);
    tap('pcat_mugs');
    crumb();
    vi.mocked(Animated.timing).mockClear();
    act(() => { vi.advanceTimersByTime(280); });
    expect(timings()).toEqual([expect.objectContaining({ toValue: 1, duration: 200 })]);
    expect(screen.getByTestId('category-tile-pcat_mugs').parentElement!.style.opacity).not.toBe('0');
    expect(screen.getByTestId('category-tile-pcat_hats').parentElement!.style.opacity).toBe('0');
    expect(screen.getByTestId('category-tile-all').parentElement!.style.opacity).toBe('0');
  });

  it('D12: a view switched in the gather is kept when the root returns', async () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    await show(make(3), { showViewToggle: true, onStateChange: changed });
    tap('pcat_mugs');
    crumb();
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { fireEvent.click(screen.getByTestId('view-toggle')); });
    expect(screen.getByTestId('table')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(180); });
    expect(screen.getByTestId('category-browse')).toBeTruthy();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'table', categoryId: null }));
    expect(screen.getByTestId('view-toggle').dataset.value).toBe('table');
  });

  it('D13: a controlled view changed in the gather is kept when the root returns', async () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const at = (categoryId: string | null, view: 'grid' | 'table' = 'grid') => <Catalogue {...props} products={make(3)}
      onStateChange={changed} viewState={{ ...DEFAULT_CATALOGUE_VIEW_STATE, view, categoryId }} />;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(at(null)); });
    tap('pcat_mugs');
    view.rerender(at('pcat_mugs'));
    crumb();
    act(() => { vi.advanceTimersByTime(100); });
    view.rerender(at('pcat_mugs', 'table'));
    act(() => { vi.advanceTimersByTime(180); });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'table', categoryId: null }));
  });

  it('D14: a cell whose index moves before its start frame still starts', async () => {
    // Fake timers fake requestAnimationFrame too (vitest 4 fakes every timer but nextTick and queueMicrotask).
    vi.useFakeTimers();
    // With no sort the level keeps the products' order, so one put first moves every existing tile's index.
    const [one] = make(1);
    const ahead = { ...one, id: 'mug-ahead', title: 'Mugs ahead', variants: [{ ...one.variants[0], id: 'mug-ahead-v' }] };
    const at = (products: unknown[]) => <Catalogue {...props} products={products} />;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(at(make(3))); });
    tap('pcat_mugs');
    act(() => { view.rerender(at([ahead, ...make(3)])); });
    expect(screen.getByTestId('category-level-parent')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(16); });
    expect(outStarts().length).toBeGreaterThanOrEqual(5);
    for (const start of outStarts()) expect(start).toHaveBeenCalled();
  });

  it('D15: a back before the start frame starts no out, and the root returns at 280ms', async () => {
    vi.useFakeTimers();
    await show(make(3));
    tap('pcat_mugs');
    crumb();
    expect(homes()).toHaveLength(4);
    act(() => { vi.advanceTimersByTime(279); });
    for (const start of outStarts()) expect(start).not.toHaveBeenCalled();
    expect(screen.queryByTestId('category-browse')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByTestId('category-browse')).toBeTruthy();
  });
});
