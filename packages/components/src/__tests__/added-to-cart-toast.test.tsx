import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AddedToCartToast } from '../shell/added-to-cart-toast';

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const toast = () => screen.queryByTestId('added-to-cart-toast');
const firstAdd = () => {
  const view = render(<AddedToCartToast added={null} />);
  view.rerender(<AddedToCartToast added={{ key: 1, name: 'Shirt' }} />);
  return view;
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('AddedToCartToast', () => {
  it('shows nothing before the first add', () => {
    render(<AddedToCartToast added={null} />);
    expect(toast()).toBeNull();
  });

  it('names the product on the first add', () => {
    firstAdd();
    expect(toast()?.textContent).toContain('Shirt added to cart');
  });

  it('a second add while open shows the running count in the same toast', () => {
    const { rerender } = firstAdd();
    rerender(<AddedToCartToast added={{ key: 2, name: 'Mug' }} />);
    expect(screen.getAllByTestId('added-to-cart-toast')).toHaveLength(1);
    expect(toast()?.textContent).toContain('2 items added to cart');
    expect(toast()?.textContent).not.toContain('Mug');
  });

  it('each add restarts the 4 s timer', () => {
    const { rerender } = firstAdd();
    advance(3_000);
    rerender(<AddedToCartToast added={{ key: 2, name: 'Mug' }} />);
    advance(3_000);
    expect(toast()).not.toBeNull();
    advance(1_001);
    expect(toast()).toBeNull();
  });

  it('the count resets after it closes', () => {
    const { rerender } = firstAdd();
    advance(4_001);
    expect(toast()).toBeNull();
    rerender(<AddedToCartToast added={{ key: 2, name: 'Mug' }} />);
    expect(toast()?.textContent).toContain('Mug added to cart');
    expect(toast()?.textContent).not.toContain('items');
  });

  it('Close hides it and resets the count', () => {
    const { rerender } = firstAdd();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(toast()).toBeNull();
    rerender(<AddedToCartToast added={{ key: 2, name: 'Mug' }} />);
    expect(toast()?.textContent).toContain('Mug added to cart');
  });

  it('the same key twice is one add', () => {
    const { rerender } = firstAdd();
    rerender(<AddedToCartToast added={{ key: 1, name: 'Shirt' }} />);
    expect(toast()?.textContent).toContain('Shirt added to cart');
    rerender(<AddedToCartToast added={{ key: 2, name: 'Mug' }} />);
    expect(toast()?.textContent).toContain('2 items added to cart');
  });
});
