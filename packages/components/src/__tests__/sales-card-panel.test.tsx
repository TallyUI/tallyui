import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

describe('SalesCards legends', () => {
  it('folds the rows past the legend limit into one Other row with their total', () => {
    const methods = ['cash', 'card', 'm3', 'm4', 'm5', 'm6', 'm7'];
    // Rows sort by amount, so the 200 and 100 payments (m6, m7) fold into Other: 300.
    const orders = methods.map((method, i) => order(`o${i}`, 700 - i * 100, { payments: [{ method, amountMinor: 700 - i * 100 }] }));
    render(<SalesCards figures={figuresOf(orders)} currency="EUR" />);
    // The 300 head row also shows money(300), so read the Other row's own text.
    const row = within(screen.getByTestId('card-payments')).getByText('Other').parentElement;
    expect(row?.textContent).toContain(money(300));
  });
});

// ADR-094, front desk 22 Nov Q3: a 10.02 sale at 10% taken as 10.00 in cash. Rounding is in gross, in no rate's net or tax.
const rounded = figuresOf([order('r', 1000, { taxMinor: 91, roundingMinor: -2,
  lines: [{ key: 'p-r', name: 'Coffee', quantity: 1, netMinor: 911, taxMinor: 91 }],
  taxes: [{ ratePpm: 100_000, label: 'GST', taxMinor: 91, netMinor: 911 }] })]);
/** A shown money cell back to minor units; '' is no amount. */
const minorOf = (cell: string | null) => {
  if (cell === '') return 0;
  for (let minor = -2000; minor <= 2000; minor++) if (money(minor) === cell) return minor;
  throw new Error(`not a money cell: ${cell}`);
};

describe('cash rounding in the taxes figures', () => {
  it('the taxes panel shows a Rounding row for a rounded period and none otherwise', () => {
    setup('taxes', rounded);
    expect(cells('detail-panel-row-0')).toEqual(['GST', money(911), money(91), money(1002)]);
    expect(cells('detail-panel-row-1')).toEqual(['Rounding', '', '', money(-2)]);
    expect(cells('detail-panel-total')).toEqual(['Total', money(911), money(91), money(1000)]);
    cleanup();
    setup('taxes', figuresOf([order('a', 1150, { taxMinor: 150, taxes: [{ ratePpm: 150_000, label: 'GST', taxMinor: 150, netMinor: 1000 }] })]));
    expect(screen.queryByTestId('detail-panel-row-1')).toBeNull();
    expect(screen.queryByText('Rounding')).toBeNull();
  });

  it("the taxes panel's Net, Tax and Rounding add up to its Gross", () => {
    setup('taxes', rounded);
    const rows = ['detail-panel-row-0', 'detail-panel-row-1'].map((testID) => cells(testID).slice(1).map(minorOf));
    const [net, tax, gross] = cells('detail-panel-total').slice(1).map(minorOf);
    // Each column sums to its total.
    [net, tax, gross].forEach((total, column) => expect(rows.reduce((sum, row) => sum + row[column], 0)).toBe(total));
    const rounding = rows[1][2];
    expect([net, tax, rounding, gross]).toEqual([911, 91, -2, 1000]);
    expect(net + tax + rounding).toBe(gross);
    cleanup();
    // The Taxes card: four stats, Net, Tax, Rounding, Gross, and the shown three add up to the shown Gross.
    render(<SalesCards figures={rounded} currency="EUR" />);
    const stats = within(screen.getByTestId('card-taxes')).getAllByText(/^(Net|Tax|Rounding|Gross)$/)
      .map((label) => [label.textContent, label.nextSibling?.textContent ?? null]);
    expect(stats).toEqual([['Net', money(911)], ['Tax', money(91)], ['Rounding', money(-2)], ['Gross', money(1000)]]);
    expect(stats.slice(0, 3).reduce((sum, [, value]) => sum + minorOf(value), 0)).toBe(minorOf(stats[3][1]));
  });
});
