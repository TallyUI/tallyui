import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRODUCT_FILTERS, ProductFilterBar } from '../sale/product-filter-bar';

afterEach(() => cleanup());

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
});
