import { View, Text, Pressable, ScrollView } from 'react-native';
import { Link, Stack } from 'expo-router';

const screens = [
  { href: '/primitives/dialog', label: 'Dialog' },
  { href: '/primitives/select', label: 'Select' },
  { href: '/primitives/popover', label: 'Popover' },
  { href: '/primitives/tabs', label: 'Tabs' },
  { href: '/primitives/dropdown-menu', label: 'Dropdown Menu' },
  { href: '/primitives/list', label: 'List' },
  { href: '/primitives/image', label: 'Image' },
] as const;

export default function PrimitivesIndex() {
  return (
    <>
      <Stack.Screen options={{ title: 'Primitives' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#fff' }}
        contentContainerStyle={{ padding: 16, gap: 8 }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>
          Tap a primitive to open its test screen.
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
