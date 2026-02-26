import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderStatusBadge } from '../order/order-status-badge';

describe('OrderStatusBadge', () => {
  it('renders "Completed" status', () => {
    render(<OrderStatusBadge status="completed" />);
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('renders "Pending" status', () => {
    render(<OrderStatusBadge status="pending" />);
    expect(screen.getByText('Pending')).toBeDefined();
  });

  it('renders "Refunded" status', () => {
    render(<OrderStatusBadge status="refunded" />);
    expect(screen.getByText('Refunded')).toBeDefined();
  });
});
