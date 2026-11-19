import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CartColumnsForm } from '../cart/cart-columns-form';
import type { CartColumnSettings } from '../cart/cart-columns';

afterEach(cleanup);

const show = (value?: CartColumnSettings, showReset?: boolean) => {
  const onChange = vi.fn();
  render(<CartColumnsForm value={value} onChange={onChange} showReset={showReset} />);
  return onChange;
};
const switches = () => screen.getAllByTestId(/^cart-columns-[a-zA-Z]+-show$/);
const checked = (id: string) => screen.getByTestId(id).getAttribute('aria-checked');

describe('CartColumnsForm', () => {
  it('CF1: lists the columns in the default order, with the default Show and On Sale switches', () => {
    show({});
    expect(screen.getByRole('heading').textContent).toBe('Columns');
    expect(switches().map((s) => s.getAttribute('aria-label'))).toEqual(
      ['Qty', 'Image', 'Name', 'SKU', 'Price', 'Regular Price', 'Total']);
    expect(switches().map((s) => s.getAttribute('aria-checked'))).toEqual(
      ['true', 'false', 'true', 'false', 'true', 'false', 'true']);
    expect(checked('cart-columns-price-onSale')).toBe('true');
  });

  it('CF2: a Show switch emits show and keeps the column\'s other fields', () => {
    const onChange = show({});
    fireEvent.click(screen.getByTestId('cart-columns-image-show'));
    expect(onChange).toHaveBeenLastCalledWith({ image: { show: true } });
    cleanup();
    const onPrice = show({ price: { onSale: false } });
    fireEvent.click(screen.getByTestId('cart-columns-price-show'));
    expect(onPrice).toHaveBeenLastCalledWith({ price: { onSale: false, show: false } });
  });

  it('CF3: Split is drawn only while Qty shows, and emits split', () => {
    show({ quantity: { show: false } });
    expect(screen.queryByTestId('cart-columns-quantity-split')).toBeNull();
    cleanup();
    const onChange = show({});
    expect(checked('cart-columns-quantity-split')).toBe('false');
    fireEvent.click(screen.getByTestId('cart-columns-quantity-split'));
    expect(onChange).toHaveBeenLastCalledWith({ quantity: { split: true } });
  });

  it('CF4: Move up on Name emits the full order with Name and Image swapped, keeping other fields', () => {
    const onChange = show({ total: { show: false } });
    fireEvent.click(screen.getByLabelText('Move Name up'));
    expect(onChange).toHaveBeenLastCalledWith({
      total: { show: false }, order: ['quantity', 'name', 'image', 'sku', 'price', 'regularPrice', 'total'],
    });
  });

  it('CF5: rows follow the saved order, and Move down swaps within the full list', () => {
    const onChange = show({ order: ['total'] });
    expect(switches()[0].getAttribute('aria-label')).toBe('Total');
    fireEvent.click(screen.getByLabelText('Move Price down'));
    expect(onChange).toHaveBeenLastCalledWith({
      order: ['total', 'quantity', 'image', 'name', 'sku', 'regularPrice', 'price'],
    });
  });

  it('CF6: the first Move up and the last Move down are disabled and emit nothing', () => {
    const onChange = show({});
    const up = screen.getByLabelText('Move Qty up');
    const down = screen.getByLabelText('Move Total down');
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(down.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByLabelText('Move Image up').getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(up);
    fireEvent.click(down);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('CF7: Restore Default Settings is drawn only with showReset, and emits {}', () => {
    show({ image: { show: true } });
    expect(screen.queryByText('Restore Default Settings')).toBeNull();
    cleanup();
    const onChange = show({ image: { show: true } }, true);
    fireEvent.click(screen.getByText('Restore Default Settings'));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('CF8: every emit is a fresh object and leaves value unchanged', () => {
    const value: CartColumnSettings = { name: { sku: true }, order: ['total'] };
    const before = structuredClone(value);
    const onChange = show(value);
    fireEvent.click(screen.getByTestId('cart-columns-name-show'));
    fireEvent.click(screen.getByTestId('cart-columns-name-sku'));
    fireEvent.click(screen.getByLabelText('Move Name up'));
    for (const [next] of onChange.mock.calls) expect(next).not.toBe(value);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(value).toEqual(before);
  });
});
