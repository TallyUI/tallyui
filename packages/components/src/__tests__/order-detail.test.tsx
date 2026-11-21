import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { OrderDetail } from '../order/order-detail';

describe('OrderDetail', () => {
  const lineItems = [{ name: 'Widget', quantity: 2, total: '20.00' }];

  it('renders order number and status', () => {
    render(
      <OrderDetail orderNumber="#1042" status="completed" lineItems={lineItems} subtotal="20.00" tax="2.00" total="22.00" />,
    );
    expect(screen.getByText('#1042')).toBeDefined();
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('renders line items', () => {
    render(
      <OrderDetail orderNumber="#1042" status="completed" lineItems={lineItems} subtotal="20.00" tax="2.00" total="22.00" />,
    );
    expect(screen.getByText('Widget x2')).toBeDefined();
  });

  it('renders custom sections via slots', () => {
    render(
      <OrderDetail
        orderNumber="#1042"
        status="completed"
        lineItems={lineItems}
        subtotal="20.00"
        tax="2.00"
        total="22.00"
        customerSlot={<Text>Jane Smith</Text>}
        paymentSlot={<Text>Paid with Cash</Text>}
      />,
    );
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.getByText('Paid with Cash')).toBeDefined();
  });

  const base = {
    orderNumber: '#1042',
    status: 'completed' as const,
    lineItems,
    subtotal: '20.00',
    tax: '2.00',
    total: '22.00',
  };
  const extras = {
    discount: '-$2.00',
    couponCodes: 'SAVE10, VIP',
    shipping: '$5.00',
    shippingMethod: 'Flat rate',
    fees: '$1.50',
  };
  const taxLines = [
    { label: 'US 10%', amount: '$9.20' },
    { label: 'US AL 2%', amount: '$2.02' },
  ];

  it('renders the meta line joined with " · ", dropping empty parts', () => {
    render(<OrderDetail {...base} meta={['Today · 14:30', '', 'US Store', 'Brenda Walsh']} />);
    expect(screen.getByTestId('order-detail-meta').textContent).toBe('Today · 14:30 · US Store · Brenda Walsh');
  });
  it('renders no meta line without meta', () => {
    const { rerender } = render(<OrderDetail {...base} />);
    expect(screen.queryByTestId('order-detail-meta')).toBeNull();
    rerender(<OrderDetail {...base} meta={['', '']} />);
    expect(screen.queryByTestId('order-detail-meta')).toBeNull();
  });
  it('renders discount with coupon chip, shipping with method, and fees', () => {
    render(<OrderDetail {...base} {...extras} />);
    for (const t of ['Discount', '-$2.00', 'SAVE10, VIP', 'Shipping', '· Flat rate', '$5.00', 'Fees', '$1.50']) {
      expect(screen.getByText(t)).toBeDefined();
    }
  });
  it('hides discount, shipping and fees rows when omitted', () => {
    const { rerender } = render(<OrderDetail {...base} />);
    for (const t of ['Discount', 'Shipping', 'Fees']) {
      expect(screen.queryByText(t)).toBeNull();
    }
    rerender(<OrderDetail {...base} discount="" />);
    expect(screen.queryByText('Discount')).toBeNull();
  });
  it('renders tax lines under Tax', () => {
    render(<OrderDetail {...base} taxLines={taxLines} />);
    for (const t of ['US 10%', '$9.20', 'US AL 2%', '$2.02']) {
      expect(screen.getByText(t)).toBeDefined();
    }
    expect(screen.getByTestId('order-detail-tax-line-1').textContent).toContain('US AL 2%');
  });
  it('orders the totals as v2 does', () => {
    const text = render(<OrderDetail {...base} {...extras} taxLines={taxLines} />).container.textContent ?? '';
    const order = ['Subtotal', 'Discount', 'Shipping', 'Fees', 'Tax', 'US 10%'].map((label) => text.indexOf(label));
    order.push(text.indexOf('Total', order[5]));
    order.forEach((at, i) => expect(at).toBeGreaterThan(i === 0 ? -1 : order[i - 1]));
  });

  it('draws no actions row when no action is passed', () => {
    render(<OrderDetail {...base} footerSlot={<Text>Note</Text>} />);
    expect(screen.queryByTestId('order-detail-actions')).toBeNull();
  });
  it('each action button shows only when its callback is passed and calls it', () => {
    const actions = { onReceipt: 'order-detail-receipt', onSync: 'order-detail-sync', onReopen: 'order-detail-reopen' };
    for (const [prop, id] of Object.entries(actions)) {
      const fn = vi.fn();
      render(<OrderDetail {...base} {...{ [prop]: fn }} />);
      expect(screen.getByTestId('order-detail-actions')).toBeDefined();
      for (const other of Object.values(actions)) {
        if (other !== id) expect(screen.queryByTestId(other)).toBeNull();
      }
      fireEvent.click(screen.getByTestId(id));
      expect(fn).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });
  it('hides Delete and Refund when only Sync is passed', () => {
    render(<OrderDetail {...base} onSync={vi.fn()} />);
    expect(screen.queryByTestId('order-detail-delete')).toBeNull();
    expect(screen.queryByTestId('order-detail-refund')).toBeNull();
  });
  it('draws the actions row with only Refund and calls it on press', () => {
    const onRefund = vi.fn();
    render(<OrderDetail {...base} onRefund={onRefund} />);
    expect(screen.getByTestId('order-detail-actions')).toBeDefined();
    fireEvent.click(screen.getByTestId('order-detail-refund'));
    expect(onRefund).toHaveBeenCalledTimes(1);
  });
  it('Delete asks first and calls onDelete only on confirm', () => {
    const onDelete = vi.fn();
    render(<><OrderDetail {...base} onDelete={onDelete} /><PortalHost /></>);
    fireEvent.click(screen.getByTestId('order-detail-delete'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete order #1042')).toBeDefined();
    fireEvent.click(screen.getByTestId('order-detail-delete-dialog-cancel'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete order #1042')).toBeNull();
    fireEvent.click(screen.getByTestId('order-detail-delete'));
    fireEvent.click(screen.getByTestId('order-detail-delete-dialog-confirm'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
  it('draws Delete before Refund with only those actions passed', () => {
    render(<OrderDetail {...base} onDelete={vi.fn()} onRefund={vi.fn()} />);
    expect(screen.getByTestId('order-detail-actions')).toBeDefined();
    expect(screen.getByTestId('order-detail-delete').compareDocumentPosition(
      screen.getByTestId('order-detail-refund'),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('reopenDisabled disables Re-open', () => {
    const onReopen = vi.fn();
    render(<OrderDetail {...base} onReopen={onReopen} reopenDisabled />);
    const reopen = screen.getByTestId('order-detail-reopen');
    expect(reopen.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(reopen);
    expect(onReopen).not.toHaveBeenCalled();
  });
});
