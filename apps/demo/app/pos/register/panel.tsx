import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, RegisterPanel, Text } from '@tallyui/components';
import { openSession, recordMovement } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

async function seed(db: DemoRegisterDb) {
  const session = await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
  });
  await recordMovement(db.register_sessions, db.cash_movements, db.closures, {
    sessionId: session.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: 'demo-cashier',
  });
}

export default function RegisterPanelScreen() {
  const { register, ready } = useDemoRegister({ seed });
  const [open, setOpen] = useState(true);
  return (
    <>
      <Stack.Screen options={{ title: 'RegisterPanel' }} />
      <View className="flex-1 bg-background p-4 gap-3" testID="register-panel-screen">
        <Button testID="open-panel" onPress={() => setOpen(true)} disabled={!ready}>
          <Text>Open panel</Text>
        </Button>
        {ready && open && (
          <RegisterPanel register={register} currency="EUR" registerName="Front counter" open onOpenChange={setOpen} />
        )}
      </View>
    </>
  );
}
