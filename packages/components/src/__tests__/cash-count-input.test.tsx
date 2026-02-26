import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CashCountInput } from '../register/cash-count-input';

describe('CashCountInput', () => {
  it('renders denomination labels', () => {
    render(<CashCountInput />);
    expect(screen.getByText('$100')).toBeDefined();
    expect(screen.getByText('$20')).toBeDefined();
    expect(screen.getByText('$1')).toBeDefined();
  });

  it('calls onChangeTotal when a denomination count changes', () => {
    const onChangeTotal = vi.fn();
    render(<CashCountInput onChangeTotal={onChangeTotal} />);
    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[2]); // $20 is index 2 (after $100, $50)
    expect(onChangeTotal).toHaveBeenCalledWith(20);
  });

  it('renders running total', () => {
    render(<CashCountInput />);
    expect(screen.getByText('Total: 0.00')).toBeDefined();
  });
});
