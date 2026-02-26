import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CashTendered } from '../checkout/cash-tendered';

describe('CashTendered', () => {
  it('renders quick amount buttons', () => {
    render(<CashTendered total={17.5} onChangeAmount={() => {}} />);
    expect(screen.getByText('17.50')).toBeDefined();
    expect(screen.getByText('20.00')).toBeDefined();
  });

  it('calls onChangeAmount when quick button is pressed', () => {
    const onChange = vi.fn();
    render(<CashTendered total={17.5} onChangeAmount={onChange} />);
    fireEvent.click(screen.getByText('20.00'));
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('accepts custom quick amounts', () => {
    render(<CashTendered total={10} quickAmounts={[10, 15, 25]} onChangeAmount={() => {}} />);
    expect(screen.getByText('10.00')).toBeDefined();
    expect(screen.getByText('15.00')).toBeDefined();
    expect(screen.getByText('25.00')).toBeDefined();
  });
});
