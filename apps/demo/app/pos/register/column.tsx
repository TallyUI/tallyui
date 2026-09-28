import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, RegisterColumn, RegisterCount, Text } from '@tallyui/components';
import { openSession } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

const REGISTERS = [{ id: 'demo-register', name: 'Front counter' }];

async function seed(db: DemoRegisterDb) {
  await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
  });
}

export default function RegisterColumnScreen() {
  const [bound, setBound] = useState(true);
  const [cartEmpty, setCartEmpty] = useState(true);
  const { register, ready } = useDemoRegister({
    registerId: bound ? 'demo-register' : null,
    // Always overdue once open, so toggling cartEmpty alone shows the Close-register offer swap.
    expectedCloseTime: '00:00',
    seed,
  });
  return (
    <>
      <Stack.Screen options={{ title: 'RegisterColumn' }} />
      <View className="flex-1 bg-background" testID="register-column-screen">
        <View className="p-4 gap-2 flex-row flex-wrap">
          <Button testID="toggle-bound" variant="outline" onPress={() => setBound((v) => !v)}>
            <Text>Toggle bound ({bound ? 'bound' : 'unbound'})</Text>
          </Button>
          <Button testID="toggle-cart-empty" variant="outline" onPress={() => setCartEmpty((v) => !v)}>
            <Text>Toggle cart empty ({cartEmpty ? 'empty' : 'has lines'})</Text>
          </Button>
        </View>
        <View className="flex-1 p-4">
          {ready || !bound ? (
            <RegisterColumn
              register={register}
              registerId={bound ? 'demo-register' : null}
              registers={REGISTERS}
              onPick={() => setBound(true)}
              currency="EUR"
              cartEmpty={cartEmpty}
              countSlot={<RegisterCount register={register} currency="EUR" />}
            >
              <Text testID="cart-slot">The cart goes here.</Text>
            </RegisterColumn>
          ) : (
            <Text>Loading…</Text>
          )}
        </View>
      </View>
    </>
  );
}
