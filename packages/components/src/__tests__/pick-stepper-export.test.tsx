// PickStepper, exported from the package root so an app cart built on CartPanel and CartLine can draw Cart's stepper.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PickStepper } from '../index';
import { PickStepper as CartsPickStepper } from '../sale/cart';

const onPick = vi.fn();
const picker = (picked: Record<string, number>) => ({ picked, paid: {}, unitMinor: (_id: string, units: number) => units * 100, onPick });

beforeEach(() => onPick.mockReset());
afterEach(cleanup);

describe('PickStepper export', () => {
  it('the package root exports the stepper Cart draws', () => {
    expect(PickStepper).toBe(CartsPickStepper);
  });

  it('draws n of unpaid and what the picked units add', () => {
    render(<PickStepper picker={picker({ L1: 2 })} id="L1" name="Shirt" unpaid={3} currency="EUR" />);
    expect(screen.getByTestId('cart-line-L1-pick-units').textContent).toBe('2 of 3');
    expect(screen.getByTestId('cart-line-L1-pick-amount').textContent).toBe(formatMoney({ amount: 200, currency: 'EUR' }));
  });

  it('+ and − call onPick with one more and one fewer', () => {
    render(<PickStepper picker={picker({ L1: 2 })} id="L1" name="Shirt" unpaid={3} currency="EUR" />);
    fireEvent.click(screen.getByTestId('cart-line-L1-pick-plus'));
    expect(onPick).toHaveBeenLastCalledWith('L1', 3);
    fireEvent.click(screen.getByTestId('cart-line-L1-pick-minus'));
    expect(onPick).toHaveBeenLastCalledWith('L1', 1);
  });

  it('shows no amount at 0 and + stops at unpaid', () => {
    const { rerender } = render(<PickStepper picker={picker({})} id="L1" name="Shirt" unpaid={1} currency="EUR" />);
    expect(screen.getByTestId('cart-line-L1-pick-units').textContent).toBe('0 of 1');
    expect(screen.queryByTestId('cart-line-L1-pick-amount')).toBeNull();
    const minus = screen.getByTestId('cart-line-L1-pick-minus');
    expect(minus.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(minus);
    expect(onPick).not.toHaveBeenCalled();
    rerender(<PickStepper picker={picker({ L1: 1 })} id="L1" name="Shirt" unpaid={1} currency="EUR" />);
    const plus = screen.getByTestId('cart-line-L1-pick-plus');
    expect(plus.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(plus);
    expect(onPick).not.toHaveBeenCalled();
  });
});
