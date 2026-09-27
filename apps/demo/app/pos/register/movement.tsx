import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, MovementSheet, Text } from '@tallyui/components';
import type { MovementType } from '@tallyui/pos';
import { openSession } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

async function seed(db: DemoRegisterDb) {
  await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
  });
}

export default function MovementSheetScreen() {
  const { register, ready } = useDemoRegister({ seed });
  const [type, setType] = useState<MovementType | null>(null);
  const [last, setLast] = useState('');
  return (
    <>
      <Stack.Screen options={{ title: 'MovementSheet' }} />
      <View className="flex-1 bg-background p-4 gap-3" testID="movement-sheet-screen">
        {(['paid_in', 'paid_out', 'no_sale'] as const).map((t) => (
          <Button key={t} testID={`open-${t.replace('_', '-')}`} onPress={() => setType(t)} disabled={!ready}>
            <Text>{t === 'paid_in' ? 'Paid in' : t === 'paid_out' ? 'Paid out' : 'No sale'}</Text>
          </Button>
        ))}
        {last && <Text testID="last-recorded">Last recorded: {last}</Text>}
        {ready && type && (
          <MovementSheet
            register={register}
            type={type}
            currency="EUR"
            onOpenChange={(open) => {
              if (!open) setType(null);
            }}
            onDone={(id, doneType, amountMinor) => setLast(`${doneType} ${amountMinor} (${id})`)}
            onOpenDrawer={() => setLast((value) => `${value} · drawer opened`)}
          />
        )}
      </View>
    </>
  );
}
