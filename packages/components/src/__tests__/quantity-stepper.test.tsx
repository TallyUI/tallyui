import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuantityStepper } from '../input/quantity-stepper';

describe('QuantityStepper', () => {
  it('renders default quantity of 1', () => {
    render(<QuantityStepper />);
    expect(screen.getByText('1')).toBeDefined();
  });

  it('renders custom default quantity', () => {
    render(<QuantityStepper defaultQuantity={5} />);
    expect(screen.getByText('5')).toBeDefined();
  });

  it('calls onChangeQuantity with incremented value on plus press', () => {
    const onChange = vi.fn();
    render(<QuantityStepper defaultQuantity={3} onChangeQuantity={onChange} />);
    fireEvent.click(screen.getByText('+'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('calls onChangeQuantity with decremented value on minus press', () => {
    const onChange = vi.fn();
    render(<QuantityStepper defaultQuantity={3} onChangeQuantity={onChange} />);
    fireEvent.click(screen.getByText('\u2212'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('does not decrement below min', () => {
    const onChange = vi.fn();
    render(<QuantityStepper defaultQuantity={1} min={1} onChangeQuantity={onChange} />);
    fireEvent.click(screen.getByText('\u2212'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not increment above max', () => {
    const onChange = vi.fn();
    render(<QuantityStepper defaultQuantity={10} max={10} onChangeQuantity={onChange} />);
    fireEvent.click(screen.getByText('+'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works in controlled mode', () => {
    render(<QuantityStepper quantity={7} />);
    expect(screen.getByText('7')).toBeDefined();
  });
});
