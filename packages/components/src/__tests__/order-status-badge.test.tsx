import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderStatusBadge } from '../order/order-status-badge';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Text: withClass(rn.Text) };
});

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

  it('renders "Cancelled" for \'cancelled\'', () => {
    render(<OrderStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeDefined();
  });

  it('renders "Cancelled" for Medusa\'s \'canceled\'', () => {
    render(<OrderStatusBadge status="canceled" />);
    expect(screen.getByText('Cancelled')).toBeDefined();
    expect(screen.queryByText('Canceled')).toBeNull();
    expect(screen.queryByText('Pending')).toBeNull();
  });

  it('styles \'canceled\' like \'cancelled\'', () => {
    render(
      <>
        <OrderStatusBadge status="cancelled" />
        <OrderStatusBadge status="canceled" />
      </>,
    );
    const labels = screen.getAllByText('Cancelled');
    expect(labels).toHaveLength(2);
    expect(labels[1].getAttribute('data-class')).toBe(labels[0].getAttribute('data-class'));
    expect(labels[0].getAttribute('data-class')).toContain('text-muted-foreground');
  });
});
