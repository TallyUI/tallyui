import { View } from 'react-native';
import { Stack } from 'expo-router';
import { OpenRegisterCard, Text } from '@tallyui/components';
import { closeSession, openSession, writeClosure } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

/** A prior session, closed with 570.10 counted cash, so the "last counted cash" chip has something to offer. */
async function seed(db: DemoRegisterDb) {
  const session = await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
  });
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: 57010 } });
  await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 57010,
    otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0',
  });
}

export default function OpenRegisterCardScreen() {
  const { register, ready } = useDemoRegister({ seed });
  return (
    <>
      <Stack.Screen options={{ title: 'OpenRegisterCard' }} />
      <View className="flex-1 bg-background p-4" testID="open-register-screen">
        {!ready ? (
          <Text>Loading…</Text>
        ) : (
          <OpenRegisterCard register={register} currency="EUR" configuredFloatMinor={20000} />
        )}
      </View>
    </>
  );
}
