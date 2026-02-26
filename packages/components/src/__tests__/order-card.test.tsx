import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderCard } from '../order/order-card';

describe('OrderCard', () => {
  it('renders order details', () => {
    render(
      <OrderCard orderNumber="#1042" date="2026-02-25" total="$38.50" status="completed" />,
    );
    expect(screen.getByText('#1042')).toBeDefined();
    expect(screen.getByText('2026-02-25')).toBeDefined();
    expect(screen.getByText('$38.50')).toBeDefined();
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('renders customer name when provided', () => {
    render(
      <OrderCard orderNumber="#1042" date="2026-02-25" total="$38.50" status="completed" customerName="Jane Smith" />,
    );
    expect(screen.getByText('Jane Smith')).toBeDefined();
  });

  it('calls onPress when tapped', () => {
    const onPress = vi.fn();
    render(
      <OrderCard orderNumber="#1042" date="2026-02-25" total="$38.50" status="completed" onPress={onPress} />,
    );
    fireEvent.click(screen.getByText('#1042'));
    expect(onPress).toHaveBeenCalled();
  });
});
