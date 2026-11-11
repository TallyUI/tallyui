import { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { SalesRoom, type SalesFilters } from '@tallyui/components';
import { comparisonRange, daysOf, presetRange, salesFigures, type ReportOrder, type ReportRefund } from '@tallyui/pos';

const TIMEZONE = 'Pacific/Auckland';
const HOUR = 3_600_000;
const coffee = { id: 'drinks', name: 'Drinks' };
const bakery = { id: 'bakery', name: 'Bakery' };

// Fixture orders over the last five weeks, each with the status, cashier and register the app would filter on.
const FIXTURES = [
  [2, 'completed', 'u1', 'r1', 1850], [5, 'processing', 'u2', 'r1', 920], [9, 'on-hold', 'u1', 'r2', 3100],
  [26, 'completed', 'u2', 'r2', 1450], [30, 'completed', 'u1', 'r1', 2600], [60, 'completed', 'u1', 'r1', 780],
  [170, 'processing', 'u2', 'r2', 4200], [200, 'completed', 'u1', 'r1', 1200], [400, 'completed', 'u2', 'r1', 2950],
  [520, 'completed', 'u1', 'r2', 640], [700, 'completed', 'u2', 'r1', 3800], [820, 'completed', 'u1', 'r1', 1990],
] as const;
const ORDERS = FIXTURES.map(([hoursAgo, status, cashierId, registerId, totalMinor], i) => {
  const taxMinor = Math.round(totalMinor * 0.13);
  const order: ReportOrder = {
    id: `o${i}`, at: new Date(Date.now() - hoursAgo * HOUR).toISOString(), totalMinor, taxMinor, discountMinor: i % 4 === 0 ? 100 : 0,
    lines: [
      { key: 'flat-white', name: 'Flat white', quantity: 2, netMinor: Math.round((totalMinor - taxMinor) * 0.6), taxMinor: 0, costMinor: 180, category: coffee },
      { key: 'scone', name: 'Cheese scone', quantity: 1, netMinor: Math.round((totalMinor - taxMinor) * 0.4), taxMinor: 0, costMinor: i === 0 ? null : 120, category: bakery },
    ],
    payments: i === 0 ? [{ method: 'cash', amountMinor: 1000 }, { method: 'card', amountMinor: 850 }] : [{ method: i % 3 ? 'card' : 'cash', amountMinor: totalMinor }],
    taxes: [{ ratePpm: 130_000, label: 'GST', taxMinor, netMinor: totalMinor - taxMinor }],
    refunds: [],
  };
  return { order, status, cashierId, registerId };
});
const REFUNDS: ReportRefund[] = [
  { id: 'r1', orderId: 'o1', at: new Date(Date.now() - 3 * HOUR).toISOString(), amountMinor: 450 },
  { id: 'r2', orderId: 'o6', at: new Date(Date.now() - 150 * HOUR).toISOString(), amountMinor: 900 },
];

export default function SalesRoomScreen() {
  const [filters, setFilters] = useState<SalesFilters>(() => ({
    preset: 'today', range: presetRange('today', new Date(), TIMEZONE), compare: 'previous', status: 'done', cashierId: null, registerId: null,
  }));
  const [opened, setOpened] = useState<string>();
  const figures = useMemo(() => {
    const orders = ORDERS.filter((row) => (filters.status === 'all' || row.status !== 'on-hold')
      && (!filters.cashierId || row.cashierId === filters.cashierId)
      && (!filters.registerId || row.registerId === filters.registerId)).map((row) => row.order);
    const ids = new Set(orders.map((order) => order.id));
    const oneDay = filters.preset === 'custom'
      ? daysOf(filters.range).length === 1 : filters.preset === 'today' || filters.preset === 'yesterday';
    return salesFigures({
      orders, refunds: REFUNDS.filter((refund) => ids.has(refund.orderId)), range: filters.range, timezone: TIMEZONE,
      compare: comparisonRange(filters.range, oneDay ? filters.compare : 'previous', filters.preset === 'custom' ? undefined : filters.preset),
    });
  }, [filters]);

  return (
    <>
      <Stack.Screen options={{ title: 'Sales room' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4">
        <SalesRoom figures={figures} filters={filters} onFiltersChange={setFilters} currency="NZD" timezone={TIMEZONE}
          statusOptions={[{ value: 'done', label: 'Completed & processing' }, { value: 'all', label: 'Every status' }]}
          cashierOptions={[{ value: 'u1', label: 'Aroha' }, { value: 'u2', label: 'Sam' }]}
          registerOptions={[{ value: 'r1', label: 'Front counter' }, { value: 'r2', label: 'Window' }]}
          onOpenCard={setOpened} />
        {opened && <Text className="text-sm text-muted-foreground">{`Opened ${opened}`}</Text>}
      </ScrollView>
    </>
  );
}
