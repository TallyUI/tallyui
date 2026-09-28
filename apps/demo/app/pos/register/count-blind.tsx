import { View } from 'react-native';
import { Stack } from 'expo-router';
import { RegisterCount, Text } from '@tallyui/components';
import { openSession, startCounting } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

async function seed(db: DemoRegisterDb) {
  const session = await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
  });
  await startCounting(db.register_sessions, session.id);
}

/** RegisterCount in blind mode: the same screen as count.tsx, with `blind` set. */
export default function RegisterCountBlindScreen() {
  const { register, ready } = useDemoRegister({ seed, blind: true });
  return (
    <>
      <Stack.Screen options={{ title: 'RegisterCount (blind)' }} />
      <View className="flex-1 bg-background p-4" testID="register-count-blind-screen">
        {!ready ? <Text>Loading…</Text> : <RegisterCount register={register} currency="EUR" />}
      </View>
    </>
  );
}
