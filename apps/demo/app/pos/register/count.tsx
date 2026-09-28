import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ClosureSheet, RegisterCount, Text } from '@tallyui/components';
import { openSession, startCounting } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

async function seed(db: DemoRegisterDb) {
  const session = await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
  });
  await startCounting(db.register_sessions, session.id);
}

/** No `approve` prop: a real app supplies its own manager gate; this demo shows the refusal instead. */
export default function RegisterCountScreen() {
  const { register, ready } = useDemoRegister({ seed, varianceThreshold: 500 });
  const [showClosure, setShowClosure] = useState(false);
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
        {!ready ? <Text>Loading…</Text> : <RegisterCount register={register} currency="EUR" />}
        {showClosure && <ClosureSheet register={register} currency="EUR" onDone={() => setShowClosure(false)} />}
      </View>
    </>
  );
}
