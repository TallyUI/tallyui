import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { CashierSheet, RegisterBar, Text } from '@tallyui/components';
import { DEMO_ACTOR, useDemoRegister } from '../../../lib/use-demo-register';

/** The cashier sheet, opened from the bar's cashier avatar, with fixed figures. */
export default function CashierSheetScreen() {
  const { register, ready } = useDemoRegister();
  const [open, setOpen] = useState(false);
  const [signOuts, setSignOuts] = useState(0);
  return (
    <>
      <Stack.Screen options={{ title: 'CashierSheet' }} />
      <View className="flex-1 bg-background" testID="cashier-sheet-screen">
        {ready && (
          <RegisterBar register={register} registerId="demo-register" online registerName="Front counter" multiRegister={false}
            onOpenPanel={() => {}} cashier={{ name: DEMO_ACTOR.name, onPress: () => setOpen(true) }} />
        )}
        <Text testID="cashier-sheet-sign-outs" className="p-4 text-muted-foreground text-sm">
          Sign out pressed {signOuts} times
        </Text>
        {open && (
          <CashierSheet
            cashier={{ name: DEMO_ACTOR.name }}
            description="Main Street · Front counter · since 09:05"
            salesToday={{ amountMinor: 123450, currency: 'EUR' }}
            onSignOut={() => setSignOuts((n) => n + 1)}
            onOpenChange={setOpen}
          />
        )}
      </View>
    </>
  );
}
