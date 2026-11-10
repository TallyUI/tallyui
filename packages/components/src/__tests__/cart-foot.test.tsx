import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { CartFoot } from '../cart';

const total = { amount: 3125, currency: 'EUR' };
const more = () => screen.getByRole('button', { name: 'More actions' });

afterEach(cleanup);

describe('CartFoot', () => {
  it('reads Checkout and the formatted total, and calls onCheckout', () => {
    const onCheckout = vi.fn();
    render(<CartFoot total={total} onCheckout={onCheckout} />);
    const checkout = screen.getByRole('button', { name: `Checkout ${formatMoney(total)}` });
    fireEvent.click(checkout);
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('does not call onCheckout while disabled', () => {
    const onCheckout = vi.fn();
    render(<CartFoot total={total} onCheckout={onCheckout} disabled />);
    fireEvent.click(screen.getByRole('button', { name: `Checkout ${formatMoney(total)}` }));
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('leaves out the ⋮ when there are no actions', () => {
    render(<CartFoot total={total} onCheckout={() => {}} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it("opens a menu of the host's items; pressing one calls it and closes the menu", () => {
    const onNote = vi.fn();
    const onVoid = vi.fn();
    render(<CartFoot total={total} onCheckout={() => {}}
      actions={[{ label: 'Add note', onPress: onNote }, { label: 'Void', onPress: onVoid, destructive: true }]} />);
    expect(more().getAttribute('aria-expanded')).toBe('false');
    expect(more().getAttribute('aria-haspopup')).toBe('menu');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(more());
    expect(more().getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: 'More actions' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Add note', 'Void']);
    // Keyboard: focus moves into the menu on open.
    expect(document.activeElement).toBe(items[0]);
    fireEvent.click(items[0]);
    expect(onNote).toHaveBeenCalledTimes(1);
    expect(onVoid).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and hands focus back to the ⋮', () => {
    render(<CartFoot total={total} onCheckout={() => {}} actions={[{ label: 'Void', onPress: () => {} }]} />);
    fireEvent.click(more());
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it('activates an item from the keyboard', () => {
    const onVoid = vi.fn();
    render(<CartFoot total={total} onCheckout={() => {}} actions={[{ label: 'Void', onPress: onVoid }]} />);
    fireEvent.click(more());
    const item = screen.getByRole('menuitem', { name: 'Void' });
    expect(item.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(item, { key: 'Enter' });
    fireEvent.keyUp(item, { key: 'Enter' });
    expect(onVoid).toHaveBeenCalledTimes(1);
  });
});
