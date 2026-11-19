import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import { DEFAULT_PRODUCT_FILTERS, ProductFilterBar, type ProductTermFilter } from '../sale/product-filter-bar';

afterEach(() => cleanup());

const TAGS = [{ value: 't1', label: 'Summer' }, { value: 't2', label: 'Organic' }];
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));
function withTag(tag: Partial<ProductTermFilter> = {}, onTermPress?: (chip: 'category' | 'tag' | 'brand') => void) {
  const onChange = vi.fn();
  render(<><ProductFilterBar value={DEFAULT_PRODUCT_FILTERS} onChange={vi.fn()} onTermPress={onTermPress}
    terms={{ tag: { options: TAGS, onChange, ...tag } }} /><PortalHost /></>);
  return onChange;
}
const chipIds = () => screen.getAllByTestId(/^filter-chip-/).map((chip) => chip.getAttribute('data-testid'));

describe('ProductFilterBar', () => {
  it("renders v2's chip set in order when a term handler is given", () => {
    render(<ProductFilterBar value={DEFAULT_PRODUCT_FILTERS} onChange={vi.fn()} onTermPress={vi.fn()} />);
    expect(chipIds()).toEqual(['filter-chip-inStock', 'filter-chip-featured', 'filter-chip-onSale',
      'filter-chip-category', 'filter-chip-tag', 'filter-chip-brand']);
    expect(screen.getByText('In Stock')).toBeTruthy();
    expect(screen.getByTestId('filter-chip-inStock').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('filter-chip-featured').getAttribute('aria-pressed')).toBe('false');
  });

  it('hides term chips without onTermPress', () => {
    render(<ProductFilterBar value={DEFAULT_PRODUCT_FILTERS} onChange={vi.fn()} />);
    expect(chipIds()).toEqual(['filter-chip-inStock', 'filter-chip-featured', 'filter-chip-onSale']);
  });

  it('toggles a chip into the filters passed out', () => {
    const onChange = vi.fn();
    render(<ProductFilterBar value={DEFAULT_PRODUCT_FILTERS} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('filter-chip-onSale'));
    expect(onChange).toHaveBeenLastCalledWith({ inStock: true, featured: false, onSale: true });
    fireEvent.click(screen.getByTestId('filter-chip-inStock'));
    expect(onChange).toHaveBeenLastCalledWith({ inStock: false, featured: false, onSale: false });
  });

  it('calls onTermPress for a term chip', () => {
    const onTermPress = vi.fn();
    const onChange = vi.fn();
    render(<ProductFilterBar value={DEFAULT_PRODUCT_FILTERS} onChange={onChange} onTermPress={onTermPress} />);
    fireEvent.click(screen.getByTestId('filter-chip-brand'));
    expect(onTermPress).toHaveBeenCalledWith('brand');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a term chip with terms picks a term', () => {
    const onChange = withTag();
    expect(screen.getByTestId('filter-chip-tag').textContent).toBe('Tag');
    press('filter-chip-tag');
    press('filter-chip-tag-t2');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('t2');
  });

  it('a picked term shows its name and an x that clears it', () => {
    const onChange = withTag({ value: 't2' });
    expect(screen.getByTestId('filter-chip-tag').textContent).toBe('Organic');
    press('filter-chip-tag-remove');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('terms wins over onTermPress for that chip; the others keep the button', () => {
    const onTermPress = vi.fn();
    withTag({}, onTermPress);
    press('filter-chip-category');
    expect(onTermPress).toHaveBeenCalledExactlyOnceWith('category');
    expect(screen.queryByTestId('filter-chip-tag-remove')).toBeNull();
    press('filter-chip-tag');
    expect(screen.getByTestId('filter-chip-tag-menu')).toBeTruthy();
    expect(onTermPress).toHaveBeenCalledTimes(1);
  });
});

describe('termGroups', () => {
  type Group = ProductTermFilter & { id: string; label: string; searchPlaceholder?: string };
  function groups(colour: Partial<Group> = {}) {
    const COLOUR: Group = { id: '3', label: 'Colour', options: [{ value: 'r', label: 'Red' }, { value: 'b', label: 'Blue' }], onChange: vi.fn(), ...colour };
    const SIZE: Group = { id: '7', label: 'Size', options: [{ value: 's', label: 'Small' }], onChange: vi.fn() };
    render(<><ProductFilterBar value={DEFAULT_PRODUCT_FILTERS} onChange={vi.fn()} termGroups={[SIZE, COLOUR]} /><PortalHost /></>);
    return { COLOUR, SIZE };
  }

  it('G1: renders the groups after the built-in chips, in the given order', () => {
    groups();
    expect(chipIds()).toEqual(['filter-chip-inStock', 'filter-chip-featured', 'filter-chip-onSale',
      'filter-chip-group-7', 'filter-chip-group-3']);
    expect(screen.getByTestId('filter-chip-group-3').textContent).toBe('Colour');
  });

  it("G2: picking a term calls only that group's onChange", () => {
    const { COLOUR, SIZE } = groups();
    press('filter-chip-group-3');
    press('filter-chip-group-3-b');
    expect(COLOUR.onChange).toHaveBeenCalledExactlyOnceWith('b');
    expect(SIZE.onChange).not.toHaveBeenCalled();
  });

  it('G3: a picked term shows its name and an x that clears it', () => {
    const { COLOUR } = groups({ value: 'r' });
    expect(screen.getByTestId('filter-chip-group-3').textContent).toBe('Red');
    press('filter-chip-group-3-remove');
    expect(COLOUR.onChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('G4: the search placeholder defaults to Search <label>, and searchPlaceholder overrides it', () => {
    groups();
    press('filter-chip-group-3');
    expect(screen.getByTestId('filter-chip-group-3-search').getAttribute('placeholder')).toBe('Search Colour');
    cleanup();
    groups({ searchPlaceholder: 'Find a colour' });
    press('filter-chip-group-3');
    expect(screen.getByTestId('filter-chip-group-3-search').getAttribute('placeholder')).toBe('Find a colour');
  });

  it('G5: an empty termGroups renders the built-in chips only', () => {
    render(<ProductFilterBar value={DEFAULT_PRODUCT_FILTERS} onChange={vi.fn()} termGroups={[]} />);
    expect(chipIds()).toEqual(['filter-chip-inStock', 'filter-chip-featured', 'filter-chip-onSale']);
  });
});
