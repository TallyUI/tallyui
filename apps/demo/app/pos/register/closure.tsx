import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Button, ClosureSheet, Text } from '@tallyui/components';
import { closeSession, openSession, writeClosure } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

/** Seeds a session closed on `countedCash` (minor units); `?counted=` overrides 19500 for the browser proof. */
function seedWith(countedCash: number) {
  return async function seed(db: DemoRegisterDb) {
    const session = await openSession(db.register_sessions, {
      registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
      openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
    });
    const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: countedCash, card: 2200 } });
    await writeClosure({
      closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: countedCash,
      otherTenders: { card: 2200 }, movements: [], orders: [], softwareVersion: '1.0.0',
      // A real card figure comes from captured sales; this demo has none, so it's given directly.
      tillExpected: { cash: 20000, card: 2200 },
    });
  };
}

export default function ClosureSheetScreen() {
  const { counted } = useLocalSearchParams<{ counted?: string }>();
  const countedCash = counted ? Number(counted) : NaN;
  const { register, ready } = useDemoRegister({ seed: seedWith(Number.isFinite(countedCash) ? countedCash : 19500) });
  const [open, setOpen] = useState(true);
  return (
    <>
      <Stack.Screen options={{ title: 'ClosureSheet' }} />
      <View className="flex-1 bg-background p-4 gap-3" testID="closure-sheet-screen">
        <Button testID="reopen-closure" onPress={() => setOpen(true)} disabled={!ready}>
          <Text>Show closure sheet</Text>
        </Button>
        {ready && open && <ClosureSheet register={register} currency="EUR" onDone={() => setOpen(false)} />}
      </View>
    </>
  );
}
