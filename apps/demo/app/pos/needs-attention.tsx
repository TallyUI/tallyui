// Needs attention's Reopen (desk 2026-11-21) over the real reopenRefusedOrder: two refused sales in an open session, the
// parked drafts their reopen writes, and the resumed sale's total and balance due.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { OrdersList, Text } from '@tallyui/components';
import { formatMoney, type StoreSettings } from '@tallyui/core';
import {
  TaxProvider, couponPricingBasis, createOrderBuilder, createTaxContext, finalizeOrder, openSession, reopenRefusedOrder,
  taxProviderProps, useParkedSales, useSale, useTax, type PosOrder,
} from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../lib/use-demo-register';

/** use-sale-reopened-legs.test.tsx's store: GBP, prices exclude tax, a 20% default rate. */
const settings: StoreSettings = { currency: 'GBP', pricesIncludeTax: false, taxRatesPpm: { default: 200000 } };
const currency = settings.currency;

/** reopen-carry's E7 shape (twoLines, exclusive), as use-sale-reopened-legs.test.tsx's refused(): a store-priced coupon,
 * paid in full in cash. Without coupons it is the same sale with none (orders-list-reopen.test.tsx's build(false)). */
function refused(id: string, sessionId: string, code: string, coupons: boolean): PosOrder {
  const builder = createOrderBuilder({ id, currency, taxContext: createTaxContext(taxProviderProps(settings)) });
  builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency }, quantity: 2 });
  const second = builder.addLine({ productId: 'p2', name: 'Cap', unitPrice: { amount: 500, currency } });
  builder.applyLineDiscount(second, { type: 'fixed', value: 40, label: 'Staff' });
  builder.applyOrderDiscount({ type: 'fixed', value: 150 });
  const ids = builder.getSnapshot().lineItems.map((line) => line.id);
  if (coupons) builder.setCoupons(['save'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['save', { couponId: 'c1', lines: [{ lineId: ids[0], amountMinor: 120 }, { lineId: ids[1], amountMinor: 30 }] }]]) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  // finalize mints the stored id (its saleId is the builder's `id`); the demo pins it, and spreads the session as its tests do.
  return { ...finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12 }, now: new Date('2026-11-21T10:00:00.000Z') }),
    id, sessionId, syncStatus: 'rejected', error: { code, message: 'Refused by the demo store' } };
}

async function seed(db: DemoRegisterDb) {
  const session = await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 11, day: 21 }, storeKey: 'store',
  });
  await db.pos_orders.bulkInsert([
    refused('demo-refused-coupon', session.id, 'coupon_invalid', true),
    refused('demo-refused-total', session.id, 'total_mismatch', false),
    // Row C: the same coupon sale, whose carry is exact on order.create 12 (`?carry=12`, orders-list-reopen's R2).
    refused('demo-refused-carried', session.id, 'coupon_invalid', true),
  ]);
}

function Attention({ db, orderCreate }: { db: DemoRegisterDb; orderCreate: number }) {
  const taxContext = useTax();
  const [orders, setOrders] = useState<PosOrder[]>([]);
  useEffect(() => {
    const subscription = db.pos_orders.find().$.subscribe((docs) => setOrders(docs.map((doc) => doc.toJSON() as PosOrder)));
    return () => subscription.unsubscribe();
  }, [db]);
  const { parked, discard } = useParkedSales(db.order_drafts);
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', drafts: db.order_drafts });
  const [resumed, setResumed] = useState(false);
  const onReopen = (order: PosOrder, options?: { withoutCoupons: true }) => reopenRefusedOrder(order.id, {
    orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions, taxContext,
    capabilities: { orderCreate }, now: () => new Date(),
  }, options).then(() => {});
  const onResume = async (order: PosOrder) => { if ((await sale.resume(order.id)) === null) setResumed(true); };
  return <View className="flex-1 gap-4">
    <View className="flex-1">
      <OrdersList orders={orders} onRetry={async () => 0} onReopen={onReopen} onResume={(order) => void onResume(order)} />
    </View>
    <View className="gap-2 px-4">
      <Text className="text-lg font-semibold text-foreground">Parked</Text>
      {parked.map(({ id, totalMinor }) => {
        const order = orders.find((row) => row.id === id && row.syncStatus === 'rejected' && !!row.coupons?.length);
        return <View key={id} testID={`parked-${id}`} className="gap-2 rounded-md border border-border bg-card p-3">
          <Text className="text-foreground">{`${id}: ${formatMoney({ amount: totalMinor, currency })}`}</Text>
          {/* A stale carried draft: the app discards it, then reopens without the coupon; there is no pos helper (desk 2026-11-21). */}
          {order ? <Pressable accessibilityRole="button" testID={`parked-${id}-discard-reopen`}
            onPress={async () => { await discard(id); await onReopen(order, { withoutCoupons: true }); }}
            className="rounded-md border border-border px-4 py-2">
            <Text className="text-center font-semibold text-foreground">Discard and reopen without the coupon</Text>
          </Pressable> : null}
        </View>;
      })}
      {resumed ? <>
        <Text testID="resumed-total" className="text-foreground">{formatMoney({ amount: sale.order.totalMinor, currency })}</Text>
        <Text testID="resumed-due" className="text-foreground">{formatMoney({ amount: sale.order.balanceDueMinor, currency })}</Text>
      </> : null}
    </View>
  </View>;
}

/** `?carry=12` is a store on order.create 12, where the coupon sale's carry is exact; else order.create 3, where it is not. */
export default function NeedsAttentionScreen() {
  const { carry } = useLocalSearchParams<{ carry?: string }>();
  const { db } = useDemoRegister({ seed });
  return (
    <View className="flex-1 bg-background" testID="needs-attention-screen">
      <Stack.Screen options={{ title: 'Needs attention' }} />
      {!db ? <Text>Loading…</Text> : <TaxProvider {...taxProviderProps(settings)}>
        <Attention db={db} orderCreate={carry === '12' ? 12 : 3} />
      </TaxProvider>}
    </View>
  );
}
