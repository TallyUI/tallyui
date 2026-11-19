import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ClosureSheet, RegisterCount, Text } from '@tallyui/components';
import { openSession, startCounting } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

async function seed(db: DemoRegisterDb) {
  const session = await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 }, storeKey: 'store',
  });
  // One card sale, so the count shows an other tender (the shape of the `sale` test helper).
  await db.pos_orders.insert({
    id: 'demo-sale-1', commandId: 'command-demo-sale-1', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: 2200, discountMinor: 0, taxMinor: 0, totalMinor: 2200,
    customer: null, syncStatus: 'pending', sessionId: session.id, cashierRef: 'demo-cashier',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    payments: [{ id: 'demo-sale-1-payment-0', method: 'external', amountMinor: 2200 }],
  });
  await startCounting(db.register_sessions, session.id);
}

/** No `approve` prop: a real app supplies its own manager gate; this demo shows the refusal instead. */
export default function RegisterCountScreen() {
  const { register, ready } = useDemoRegister({ seed, varianceThreshold: 500 });
  const [showClosure, setShowClosure] = useState(false);
  // No real printer here: the Z report "prints" by showing a line.
  const [printed, setPrinted] = useState(false);
  const onPrint = () => setPrinted(true);
  // A close passes through an intermediate 'closed, closure not yet written' snapshot before
  // `lastClosure` is set, so this remembers "was counting" across that gap rather than reading
  // only the immediately preceding render's status.
  const hadCounting = useRef(false);
  useEffect(() => {
    if (register.session?.status === 'counting') {
      hadCounting.current = true;
    } else if (hadCounting.current && register.lastClosure) {
      setShowClosure(true);
      hadCounting.current = false;
    }
  }, [register.session?.status, register.lastClosure]);
  return (
    <>
      <Stack.Screen options={{ title: 'RegisterCount' }} />
      <View className="flex-1 bg-background p-4" testID="register-count-screen">
        {!ready ? <Text>Loading…</Text> : <RegisterCount register={register} currency="EUR" onPrint={onPrint} />}
        {printed && <Text testID="demo-z-printed">Z report sent to the demo printer</Text>}
        {showClosure && <ClosureSheet register={register} currency="EUR" onPrint={onPrint} onDone={() => setShowClosure(false)} />}
      </View>
    </>
  );
}
