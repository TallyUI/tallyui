import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { csvFromCells, salesFigures, type ReportOrder, type SalesFigures } from '@tallyui/pos';
import { SalesCardPanel, SalesCards, type SalesCardPanelProps, type SalesPanelId } from '../reports';

const day = { from: '2026-11-11', to: '2026-11-11' };
const drinks = { id: 'drinks', name: 'Drinks' };
const order = (id: string, totalMinor: number, overrides: Partial<ReportOrder> = {}): ReportOrder => ({
  id, at: '2026-11-11T09:00:00Z', totalMinor, taxMinor: 0, discountMinor: 0, payments: [], taxes: [], refunds: [],
  lines: [{ key: `p-${id}`, name: 'Coffee', quantity: 1, netMinor: totalMinor, taxMinor: 0 }], ...overrides,
});
const figuresOf = (orders: ReportOrder[]) => salesFigures({ orders, range: day, timezone: 'UTC' });
const payments = figuresOf([order('a', 1500, { taxMinor: 300, payments: [{ method: 'cash', amountMinor: 1500 }] }), order('b', 1000)]);
// One costed line (Coffee) and one with no cost (Scone, no category).
const costed = figuresOf([order('a', 2500, { lines: [
  { key: 'coffee', name: 'Coffee', quantity: 1, netMinor: 1500, taxMinor: 0, costMinor: 500, category: drinks },
  { key: 'scone', name: 'Scone', quantity: 1, netMinor: 1000, taxMinor: 0, costMinor: null },
] })]);
const money = (minor: number) => formatMoney({ amount: minor, currency: 'EUR' });
const text = (testID: string) => screen.getByTestId(testID).textContent;
const cells = (testID: string) => Array.from(screen.getByTestId(testID).children, (cell) => cell.textContent);
const head = () => Array.from(screen.getByTestId('detail-panel-table').querySelectorAll('[role="columnheader"]'), (cell) => cell.textContent);

function setup(card: SalesPanelId | null, figures: SalesFigures, props: Partial<SalesCardPanelProps> = {}) {
  const onClose = vi.fn();
  const onExportCsv = vi.fn();
  render(
    <SalesCardPanel card={card} figures={figures} currency="EUR" scope="Today · Front" onClose={onClose} onExportCsv={onExportCsv} {...props} />,
    { wrapper: ({ children }) => <>{children}<PortalHost /></> },
  );
  return { onClose, onExportCsv };
}

afterEach(cleanup);

describe('SalesCardPanel', () => {
  it('payments panel lists every method with orders, amount and share, and a total row', () => {
    setup('payments', payments);
    expect(screen.getByText('Sales by payment method')).toBeTruthy();
    expect(text('detail-panel-scope')).toBe('Today · Front');
    expect(head()).toEqual(['Method', 'Orders', 'Amount', 'Share']);
    expect(cells('detail-panel-row-0')).toEqual(['cash', '1', money(1500), '60.0%']);
    expect(cells('detail-panel-row-1')).toEqual(['Unknown', '1', money(1000), '40.0%']);
    expect(cells('detail-panel-total')).toEqual(['Total', '2', money(2500), '']);
    expect(text('detail-panel-status')).toBe(`2 orders · ${money(2500)}`);
  });

  it('products panel adds Cost, Profit and Margin % and names missing costs in the footer', () => {
    setup('products', costed);
    expect(screen.getByText('Top products')).toBeTruthy();
    expect(head()).toEqual(['Product', 'Qty', 'Amount', 'Cost', 'Profit', 'Margin %']);
    expect(cells('detail-panel-row-0')).toEqual(['Coffee', '1', money(1500), money(500), money(1000), '66.7%']);
    expect(cells('detail-panel-row-1')).toEqual(['Scone', '1', money(1000), '—', '—', '—']);
    expect(cells('detail-panel-total')).toEqual(['All products', '2', money(2500), money(500), money(1000), '66.7%']);
    expect(text('detail-panel-status')).toBe(`1 orders · ${money(2500)} · cost missing on 1 of 2 items`);
  });

  it('categories panel puts Share after the margin columns and names the uncategorised row', () => {
    setup('categories', costed);
    expect(screen.getByText('Sales by category')).toBeTruthy();
    expect(head()).toEqual(['Category', 'Qty', 'Amount', 'Cost', 'Profit', 'Margin %', 'Share']);
    expect(cells('detail-panel-row-0')).toEqual(['Drinks', '1', money(1500), money(500), money(1000), '66.7%', '60.0%']);
    expect(cells('detail-panel-row-1')).toEqual(['Uncategorised', '1', money(1000), '—', '—', '—', '40.0%']);
    expect(cells('detail-panel-total')).toEqual(['Total', '2', money(2500), money(500), money(1000), '66.7%', '']);
  });

  it('taxes panel shows Net and Gross as — when a rate\'s net is unknown', () => {
    setup('taxes', figuresOf([
      order('a', 1150, { taxMinor: 150, taxes: [{ ratePpm: 150_000, label: 'GST', taxMinor: 150, netMinor: 1000 }] }),
      order('b', 550, { taxMinor: 50, taxes: [{ ratePpm: 100_000, label: '', taxMinor: 50, netMinor: null }] }),
    ]));
    expect(screen.getByText('Taxes collected')).toBeTruthy();
    expect(head()).toEqual(['Rate', 'Net', 'Tax', 'Gross']);
    expect(cells('detail-panel-row-0')).toEqual(['GST', money(1000), money(150), money(1150)]);
    expect(cells('detail-panel-row-1')).toEqual(['Tax', '—', money(50), '—']);
    expect(cells('detail-panel-total')).toEqual(['Total', money(1500), money(200), money(1700)]);
  });

  it('Export CSV hands over the shown rows and v2\'s file name, and is absent without onExportCsv', () => {
    const { onExportCsv } = setup('payments', payments);
    fireEvent.click(screen.getByTestId('detail-panel-export'));
    expect(onExportCsv).toHaveBeenCalledWith(csvFromCells([
      ['Method', 'Orders', 'Amount', 'Share'], ['cash', '1', money(1500), '60.0%'], ['Unknown', '1', money(1000), '40.0%'],
      ['Total', '2', money(2500), ''],
    ]), 'sales-payments-2026-11-11-2026-11-11.csv');
    cleanup();
    setup('payments', payments, { onExportCsv: undefined });
    expect(screen.queryByTestId('detail-panel-export')).toBeNull();
  });

  it('Close calls onClose; a null card renders no panel', () => {
    const { onClose } = setup('taxes', payments);
    fireEvent.click(screen.getByTestId('detail-panel-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    setup(null, payments);
    expect(screen.queryByTestId('detail-panel')).toBeNull();
  });
});

describe('SalesCards heads', () => {
  it('cards show a chevron only when onOpenCard is given', () => {
    const onOpenCard = vi.fn();
    render(<SalesCards figures={payments} currency="EUR" onOpenCard={onOpenCard} />);
    expect(screen.getByTestId('card-payments-chevron')).toBeTruthy();
    fireEvent.click(screen.getByTestId('card-payments-open'));
    expect(onOpenCard).toHaveBeenCalledWith('payments');
    cleanup();
    render(<SalesCards figures={payments} currency="EUR" />);
    expect(screen.queryByTestId('card-payments-chevron')).toBeNull();
    expect(screen.queryByTestId('card-payments-open')).toBeNull();
  });
});
