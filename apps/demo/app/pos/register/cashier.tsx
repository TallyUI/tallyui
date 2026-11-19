import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CashierSheet, RegisterBar, Switch, Text } from '@tallyui/components';
import { DEMO_ACTOR, useDemoRegister } from '../../../lib/use-demo-register';

/** The cashier sheet, opened from the bar's cashier avatar, with fixed figures. */
export default function CashierSheetScreen() {
  const { register, ready } = useDemoRegister();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState('nothing');
  // The open sheet's scrim covers the toggle, so `?paying=1` opens the screen with the hold on.
  const { paying: payingParam } = useLocalSearchParams<{ paying?: string }>();
  const [paying, setPaying] = useState(payingParam === '1');
  return (
    <>
      <Stack.Screen options={{ title: 'CashierSheet' }} />
      <View className="flex-1 bg-background" testID="cashier-sheet-screen">
        {ready && (
          <RegisterBar register={register} registerId="demo-register" online registerName="Front counter" multiRegister={false}
            onOpenPanel={() => {}} cashier={{ name: DEMO_ACTOR.name, onPress: () => setOpen(true) }} />
        )}
        <View className="flex-row items-center gap-3 p-4">
          <Switch testID="cashier-sheet-paying-toggle" accessibilityLabel="Paying" checked={paying} onCheckedChange={setPaying} />
          <Text>Paying</Text>
        </View>
        <Text testID="cashier-sheet-sign-outs" className="p-4 text-muted-foreground text-sm">
          Last pressed: {last}
        </Text>
        {open && (
          <CashierSheet
            cashier={{ name: DEMO_ACTOR.name }}
            description="Main Street · Front counter · since 09:05"
            salesToday={{ amountMinor: 123450, currency: 'EUR' }}
            onSignOut={() => setLast('Sign out')}
            onOpenChange={setOpen}
            drawer={{ state: 'open', figure: { kind: 'cash', amountMinor: 18250, currency: 'EUR' }, openedAt: '09:05', opener: { name: DEMO_ACTOR.name }, onOpen: () => setLast('Drawer') }}
            handTo={{ cashiers: [{ id: 'sam', name: 'Sam Lee', openCarts: 2 }, { id: 'ana', name: 'Ana Ruiz' }], onHandTo: (id) => setLast(`Hand to ${id}`) }}
            paying={paying}
            awaitingStore={3}
            store={{ name: 'Main Street', onSwitch: () => setLast('Switch store') }}
            register={{ name: 'Front counter', onSwitch: () => setLast('Switch register') }}
          />
        )}
      </View>
    </>
  );
}
