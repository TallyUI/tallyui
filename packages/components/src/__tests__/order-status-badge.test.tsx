import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderStatusBadge, type OrderStatus } from '../order/order-status-badge';

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
    expect(labels[0].getAttribute('data-class')).toContain('text-foreground');
    const dotClasses = (labels[0].previousElementSibling?.getAttribute('data-class') ?? '').split(/\s+/);
    expect(dotClasses).toContain('bg-muted-foreground');
  });

  it.each([
    ['on-hold', 'On hold', 'bg-warning'],
    ['failed', 'Failed', 'bg-destructive'],
    ['pos-open', 'POS open', 'bg-info'],
    ['pos-partial', 'POS partial', 'bg-warning'],
    ['refunded', 'Refunded', 'bg-muted-foreground'],
    ['trash', 'Trash', 'bg-muted-foreground'],
    ['checkout-draft', 'Draft', 'bg-primary'],
  ] as const)('renders v2\'s label and tone for %s', (status, label, dot) => {
    render(<OrderStatusBadge status={status} />);
    const text = screen.getByText(label);
    expect(text).toBeDefined();
    expect(screen.queryByText('Pending')).toBeNull();
    const dotClasses = (text.previousElementSibling?.getAttribute('data-class') ?? '').split(/\s+/);
    expect(dotClasses).toContain(dot);
    expect(text.getAttribute('data-class')).toContain('text-foreground');
  });

  it.each(['wc-custom-status', 'toString'])('shows an unknown status as its raw string in the default tone', (status) => {
    render(<OrderStatusBadge status={status as OrderStatus} />);
    const text = screen.getByText(status);
    expect(text).toBeDefined();
    expect(screen.queryByText('Pending')).toBeNull();
    const dotClasses = (text.previousElementSibling?.getAttribute('data-class') ?? '').split(/\s+/);
    expect(dotClasses).toContain('bg-primary');
  });
});

describe("drawn as v2's StatusBadge", () => {
  const classes = (el: Element | null | undefined) => (el?.getAttribute('data-class') ?? '').split(/\s+/);
  const ALL_STATUSES: OrderStatus[] = [
    'pending',
    'processing',
    'completed',
    'refunded',
    'cancelled',
    'canceled',
    'on-hold',
    'failed',
    'pos-open',
    'pos-partial',
    'trash',
    'checkout-draft',
  ];

  it.each([...ALL_STATUSES, 'wc-custom-status'])('T1 draws %s with no wash at v2 spacing', (status) => {
    render(<OrderStatusBadge testID="row" status={status as OrderStatus} />);
    const row = classes(screen.getByTestId('row'));
    expect(row).toEqual(expect.arrayContaining(['flex-row', 'items-center', 'gap-1.5', 'self-start']));
    expect(row.filter((c) => /^(bg-|rounded|px-|py-)/.test(c))).toEqual([]);
  });

  it("T2 draws v2's size-2 dot and text-sm foreground word", () => {
    render(<OrderStatusBadge testID="row" status="completed" />);
    const dot = classes(screen.getByTestId('row').firstElementChild);
    expect(dot).toEqual(expect.arrayContaining(['size-2', 'rounded-full']));
    expect(dot).not.toContain('size-1.5');
    expect(dot).not.toContain('h-1.5');
    const word = classes(screen.getByText('Completed'));
    expect(word).toEqual(expect.arrayContaining(['text-sm', 'text-foreground']));
    expect(word).not.toContain('text-xs');
    expect(word).not.toContain('font-semibold');
  });

  it('T3 still lands a caller className on the row', () => {
    render(<OrderStatusBadge testID="row" status="failed" className="bg-muted rounded-md px-2" />);
    const row = screen.getByTestId('row');
    expect(classes(row)).toEqual(expect.arrayContaining(['bg-muted', 'rounded-md', 'px-2', 'self-start']));
    expect(classes(row.firstElementChild)).toContain('bg-destructive');
  });
});
