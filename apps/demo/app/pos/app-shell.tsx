import { useState } from 'react';
import { Text as RNText, View } from 'react-native';
import { Stack } from 'expo-router';
import { AppShell, RegisterBar, Text, type ShellNavItem } from '@tallyui/components';
import { useDemoRegister } from '../../lib/use-demo-register';

/** A text glyph stands in for an app's icon set: it takes the nav item's tint like an SVG icon would. */
function Glyph({ children }: { children: string }) {
  return <RNText style={{ fontSize: 20, lineHeight: 24, textAlign: 'center' }}>{children}</RNText>;
}

/** v2's drawer routes (apps/main/app/(app)/(drawer)/_layout.tsx), a subset, with Settings in the bottom group. */
const NAV: ShellNavItem[] = [
  { id: 'pos', label: 'POS', icon: <Glyph>$</Glyph> },
  { id: 'products', label: 'Products', icon: <Glyph>▦</Glyph> },
  { id: 'orders', label: 'Orders', icon: <Glyph>≡</Glyph>, badge: 2 },
  { id: 'customers', label: 'Customers', icon: <Glyph>☺</Glyph> },
  { id: 'settings', label: 'Settings', icon: <Glyph>⚙</Glyph>, group: 'bottom' },
];

export default function AppShellScreen() {
  const [active, setActive] = useState('pos');
  const { register, ready } = useDemoRegister({});
  const page = NAV.find((item) => item.id === active)?.label;
  return (
    <>
      <Stack.Screen options={{ title: 'AppShell' }} />
      <AppShell
        navItems={NAV}
        activeId={active}
        onNavigate={setActive}
        registerBar={ready ? (
          <RegisterBar
            register={register}
            registerId="demo-register"
            online
            multiRegister
            storeName="Demo Store"
            registerName="Front counter"
            cashier={{ name: 'Demo cashier' }}
            syncStatus={<Text className="text-muted-foreground text-sm">Synced</Text>}
            onOpenPanel={() => {}}
          />
        ) : null}
      >
        <View className="flex-1 p-4">
          <Text testID="app-shell-page" className="text-foreground text-lg font-semibold">{page}</Text>
        </View>
      </AppShell>
    </>
  );
}
