import { View, Text, Pressable, ScrollView } from 'react-native';
import { Link, Stack } from 'expo-router';

const screens = [
  // Input
  { href: '/pos/quantity-stepper', label: 'QuantityStepper' },
  // Cart
  { href: '/pos/discount-badge', label: 'DiscountBadge' },
  { href: '/pos/cart-note-input', label: 'CartNoteInput' },
  // Product
  { href: '/pos/category-nav', label: 'CategoryNav' },
  { href: '/pos/product-variant-picker', label: 'ProductVariantPicker' },
  // Checkout
  { href: '/pos/cash-tendered', label: 'CashTendered' },
  { href: '/pos/change-display', label: 'ChangeDisplay' },
  // Order
  { href: '/pos/order-status-badge', label: 'OrderStatusBadge' },
  { href: '/pos/order-card', label: 'OrderCard' },
  // Register
  { href: '/pos/cash-count-input', label: 'CashCountInput' },
  { href: '/pos/register-open-close', label: 'RegisterOpenClose' },
  // Settings
  { href: '/pos/connector-status', label: 'ConnectorStatus' },
  { href: '/pos/settings-group', label: 'SettingsGroup' },
] as const;

export default function POSIndex() {
  return (
    <>
      <Stack.Screen options={{ title: 'POS Components' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#fff' }}
        contentContainerStyle={{ padding: 16, gap: 8 }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>
          POS-specific components from @tallyui/components. Tap to see demos.
        </Text>
        {screens.map(({ href, label }) => (
          <Link key={href} href={href} asChild>
            <Pressable
              style={{
                backgroundColor: '#f3f4f6',
                padding: 16,
                borderRadius: 10,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>{label}</Text>
              <Text style={{ fontSize: 18, color: '#9ca3af' }}>&rsaquo;</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </>
  );
}
