import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RegisterSummary } from '../register/register-summary';

describe('RegisterSummary', () => {
  it('renders expected and actual cash amounts', () => {
    render(<RegisterSummary expectedCash={500} actualCash={495} transactions={[]} />);
    expect(screen.getByText('500.00')).toBeDefined();
    expect(screen.getByText('495.00')).toBeDefined();
  });

  it('renders discrepancy', () => {
    render(<RegisterSummary expectedCash={500} actualCash={495} transactions={[]} />);
    expect(screen.getByText('-5.00')).toBeDefined();
  });

  it('renders transaction summary', () => {
    const transactions = [
      { method: 'Cash', count: 10, total: 250 },
      { method: 'Card', count: 5, total: 150 },
    ];
    render(<RegisterSummary expectedCash={500} actualCash={500} transactions={transactions} />);
    expect(screen.getByText('Cash')).toBeDefined();
    expect(screen.getByText('10 transactions')).toBeDefined();
  });
});
