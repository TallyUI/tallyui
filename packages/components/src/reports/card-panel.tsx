/**
 * A Sales room card's figure in full: the side panel its head opens. Port of WCPOS v2
 * `screens/main/reports/panels/` (`panel.tsx`, `specs.ts`, `export-csv.ts`); copy is v2's
 * English. An unknown cost or margin shows `—`, never 0, as on the cards.
 */
import type { JSX } from 'react';
import { ScrollView } from 'react-native';
import { useFormatMoney } from '@tallyui/core';
import { csvFromCells, type GroupRow, type Margin, type SalesFigures } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { UNKNOWN, categoryLabel, paymentLabel, percent, productLabel, taxLabel } from './cards';

export type SalesPanelId = 'payments' | 'products' | 'categories' | 'taxes';
export interface SalesCardPanelProps {
  /** The open card; null = closed. */
  card: SalesPanelId | null;
  figures: SalesFigures;
  currency: string;
  /** The scope line under the title, e.g. "Today · Front counter"; the app words it. */
  scope?: string;
  onClose: () => void;
  /** Export CSV shows only when given; receives the CSV text and v2's file name. */
  onExportCsv?: (csv: string, filename: string) => void;
}

const TITLES: Record<SalesPanelId, string> = {
  payments: 'Sales by payment method', products: 'Top products', categories: 'Sales by category', taxes: 'Taxes collected',
};

/** The panel's cells as shown (and exported): head, one line per row, the total row. */
function panelCells(card: SalesPanelId, figures: SalesFigures, money: (minor: number) => string) {
  const { totals } = figures;
  const share = (minor: number) => (totals.grossMinor === 0 ? '' : percent(minor / totals.grossMinor));
  // Cost and Profit are unknown when no item was costed.
  const margins = (margin: Margin, quantity: number) => {
    const costed = margin.missingQuantity < quantity;
    return [costed ? money(margin.costMinor) : UNKNOWN, costed ? money(margin.profitMinor) : UNKNOWN,
      margin.marginPct === null ? UNKNOWN : percent(margin.marginPct)];
  };
  const groupRow = (row: GroupRow, label: string) => [label, String(row.quantity), money(row.netMinor), ...margins(row.margin, row.quantity)];
  const groupTotal = (rows: GroupRow[], label: string) => [label, String(rows.reduce((sum, row) => sum + row.quantity, 0)),
    money(rows.reduce((sum, row) => sum + row.netMinor, 0)), ...margins(totals.margin, totals.items)];
  switch (card) {
    case 'payments': return {
      head: ['Method', 'Orders', 'Amount', 'Share'],
      rows: figures.payments.rows.map((row) => [paymentLabel(row), String(row.orders), money(row.amountMinor), share(row.amountMinor)]),
      total: ['Total', String(totals.orderCount), money(totals.grossMinor), ''],
    };
    case 'products': return {
      head: ['Product', 'Qty', 'Amount', 'Cost', 'Profit', 'Margin %'],
      rows: figures.products.map((row) => groupRow(row, productLabel(row))),
      total: groupTotal(figures.products, 'All products'),
    };
    case 'categories': return {
      head: ['Category', 'Qty', 'Amount', 'Cost', 'Profit', 'Margin %', 'Share'],
      rows: figures.categories.map((row) => [...groupRow(row, categoryLabel(row)), share(row.netMinor)]),
      total: [...groupTotal(figures.categories, 'Total'), ''],
    };
    case 'taxes': return {
      head: ['Rate', 'Net', 'Tax', 'Gross'],
      rows: figures.taxes.map((row) => [taxLabel(row), row.netMinor === null ? UNKNOWN : money(row.netMinor), money(row.taxMinor),
        row.netMinor === null ? UNKNOWN : money(row.netMinor + row.taxMinor)]),
      total: ['Total', money(totals.netMinor), money(totals.taxMinor), money(totals.grossMinor)],
    };
  }
}

function Cells({ cells, head }: { cells: string[]; head?: boolean }): JSX.Element {
  const Cell = head ? TableHead : TableCell;
  return (
    <>
      {cells.map((cell, i) => (
        <Cell key={i} style={{ flex: i === 0 ? 2 : 1 }} className="px-2 py-2">
          <Text numberOfLines={1} className={cn(!head && 'text-sm', i > 0 && 'text-right tabular-nums')}>{cell}</Text>
        </Cell>
      ))}
    </>
  );
}

export function SalesCardPanel({ card, figures, currency, scope, onClose, onExportCsv }: SalesCardPanelProps): JSX.Element {
  const formatMoney = useFormatMoney();
  const money = (minor: number) => formatMoney({ amount: minor, currency }) ?? '';
  const { totals } = figures;
  const cells = card === null ? null : panelCells(card, figures, money);
  const costMissing = (card === 'products' || card === 'categories') && totals.margin.missingLines > 0
    ? ` · cost missing on ${totals.margin.missingQuantity} of ${totals.items} items` : '';

  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && onClose()}>
      {card !== null && cells && (
        <DialogContent side="right" testID="detail-panel">
          <DialogHeader>
            <DialogTitle>{TITLES[card]}</DialogTitle>
            {scope && <DialogDescription testID="detail-panel-scope">{scope}</DialogDescription>}
          </DialogHeader>
          <Table testID="detail-panel-table" className="flex-1">
            <TableHeader><TableRow><Cells cells={cells.head} head /></TableRow></TableHeader>
            <ScrollView className="flex-1">
              <TableBody>
                {cells.rows.map((row, i) => <TableRow key={i} testID={`detail-panel-row-${i}`}><Cells cells={row} /></TableRow>)}
              </TableBody>
            </ScrollView>
            <TableFooter><TableRow testID="detail-panel-total" className="border-0"><Cells cells={cells.total} /></TableRow></TableFooter>
          </Table>
          <DialogFooter testID="detail-panel-footer" className="flex-row items-center gap-2">
            <Text testID="detail-panel-status" className="flex-1 text-sm text-muted-foreground">
              {`${totals.orderCount} orders · ${money(totals.grossMinor)}${costMissing}`}
            </Text>
            <Button testID="detail-panel-close" variant="outline" className="min-h-11" onPress={onClose}><Text>Close</Text></Button>
            {onExportCsv && (
              <Button testID="detail-panel-export" variant="outline" className="min-h-11"
                onPress={() => onExportCsv(csvFromCells([cells.head, ...cells.rows, cells.total]), `sales-${card}-${figures.range.from}-${figures.range.to}.csv`)}>
                <Text>Export CSV</Text>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
