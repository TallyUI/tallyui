import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import {
  ActivityHeartbeatIcon,
  AppShell,
  CashRegisterIcon,
  ChartLineIcon,
  DiscountIcon,
  GiftIcon,
  MessageQuestionIcon,
  ReceiptIcon,
  RegisterBar,
  SettingsIcon,
  Text,
  UsersIcon,
  type ShellNavItem,
} from '@tallyui/components';
import { useDemoRegister } from '../../lib/use-demo-register';

/**
 * v2's nine drawer routes in its order, with its icons (`DRAWER_ICONS` and the `Drawer.Screen` list in
 * apps/main/app/(app)/(drawer)/_layout.tsx): health starts the bottom group and carries v2's only count.
 * Icons are drawn at v2's rail size and stroke.
 */
const NAV: ShellNavItem[] = [
  { id: 'pos', label: 'POS', icon: <CashRegisterIcon size={24} strokeWidth={1.5} /> },
  { id: 'products', label: 'Products', icon: <GiftIcon size={24} strokeWidth={1.5} /> },
  { id: 'orders', label: 'Orders', icon: <ReceiptIcon size={24} strokeWidth={1.5} /> },
  { id: 'coupons', label: 'Coupons', icon: <DiscountIcon size={24} strokeWidth={1.5} /> },
  { id: 'customers', label: 'Customers', icon: <UsersIcon size={24} strokeWidth={1.5} /> },
  { id: 'reports', label: 'Reports', icon: <ChartLineIcon size={24} strokeWidth={1.5} /> },
  {
    id: 'health',
    label: 'Store health',
    icon: <ActivityHeartbeatIcon size={24} strokeWidth={1.5} />,
    badge: 2,
    group: 'bottom',
  },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={24} strokeWidth={1.5} />, group: 'bottom' },
  { id: 'support', label: 'Support', icon: <MessageQuestionIcon size={24} strokeWidth={1.5} />, group: 'bottom' },
];

export default function AppShellScreen() {
  const [active, setActive] = useState('pos');
  const { register, ready } = useDemoRegister({});
  const page = NAV.find((item) => item.id === active)?.label;
  return (
    <>
      {/* v2's drawer screens set headerShown: false (every screen carries its own bar). */}
      <Stack.Screen options={{ title: 'AppShell', headerShown: false }} />
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
