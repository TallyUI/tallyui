import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductVariantPicker } from '../product/product-variant-picker';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => (
      <Base ref={ref} {...props} dataSet={{ class: props.className }} />
    ));
  return { ...rn, View: withClass(rn.View), Pressable: withClass(rn.Pressable) };
});

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

  describe('dimmed values', () => {
    const classesOf = (id: string) =>
      (screen.getByTestId(id).getAttribute('data-class') ?? '').split(/\s+/);
    const dimmedSize = [{ name: 'Size', values: ['S', 'M', 'L'], dimmed: ['L'] }];

    it('D1: draws only listed values with opacity-50', () => {
      render(<ProductVariantPicker options={dimmedSize} />);
      expect(classesOf('variant-option-Size-L')).toContain('opacity-50');
      expect(classesOf('variant-option-Size-S')).not.toContain('opacity-50');
      expect(classesOf('variant-option-Size-M')).not.toContain('opacity-50');
    });

    it('D2: a dimmed value stays pressable', () => {
      const onSelect = vi.fn();
      render(
        <ProductVariantPicker
          options={dimmedSize}
          selected={{ Color: 'Red' }}
          onSelect={onSelect}
        />,
      );
      fireEvent.click(screen.getByTestId('variant-option-Size-L'));
      expect(onSelect).toHaveBeenCalledWith({ Color: 'Red', Size: 'L' });
    });

    it('D3: a dimmed selected value keeps the active classes', () => {
      render(<ProductVariantPicker options={dimmedSize} selected={{ Size: 'L' }} />);
      const classes = classesOf('variant-option-Size-L');
      expect(classes).toContain('border-primary');
      expect(classes).toContain('opacity-50');
    });

    it('D4: no dimmed input means no opacity-50', () => {
      render(<ProductVariantPicker options={options} />);
      for (const id of ['Size-S', 'Size-M', 'Size-L', 'Color-Red', 'Color-Blue']) {
        expect(classesOf(`variant-option-${id}`)).not.toContain('opacity-50');
      }
    });
  });
});
