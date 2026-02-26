import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductVariantPicker } from '../product/product-variant-picker';

describe('ProductVariantPicker', () => {
  const options = [
    { name: 'Size', values: ['S', 'M', 'L'] },
    { name: 'Color', values: ['Red', 'Blue'] },
  ];

  it('renders option group labels', () => {
    render(<ProductVariantPicker options={options} onSelect={() => {}} />);
    expect(screen.getByText('Size')).toBeDefined();
    expect(screen.getByText('Color')).toBeDefined();
  });

  it('renders all option values', () => {
    render(<ProductVariantPicker options={options} onSelect={() => {}} />);
    expect(screen.getByText('S')).toBeDefined();
    expect(screen.getByText('M')).toBeDefined();
    expect(screen.getByText('L')).toBeDefined();
    expect(screen.getByText('Red')).toBeDefined();
    expect(screen.getByText('Blue')).toBeDefined();
  });

  it('calls onSelect with updated selection', () => {
    const onSelect = vi.fn();
    render(<ProductVariantPicker options={options} selected={{ Size: 'S' }} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('M'));
    expect(onSelect).toHaveBeenCalledWith({ Size: 'M' });
  });
});
