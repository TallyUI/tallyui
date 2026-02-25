import { View, Text, Pressable, ScrollView } from 'react-native';
import { Link, Stack } from 'expo-router';

const screens = [
  { href: '/primitives/accordion', label: 'Accordion' },
  { href: '/primitives/alert-dialog', label: 'Alert Dialog' },
  { href: '/primitives/checkbox', label: 'Checkbox' },
  { href: '/primitives/collapsible', label: 'Collapsible' },
  { href: '/primitives/context-menu', label: 'Context Menu' },
  { href: '/primitives/dialog', label: 'Dialog' },
  { href: '/primitives/dropdown-menu', label: 'Dropdown Menu' },
  { href: '/primitives/hover-card', label: 'Hover Card' },
  { href: '/primitives/image', label: 'Image' },
  { href: '/primitives/label', label: 'Label' },
  { href: '/primitives/list', label: 'List' },
  { href: '/primitives/popover', label: 'Popover' },
  { href: '/primitives/progress', label: 'Progress' },
  { href: '/primitives/radio-group', label: 'Radio Group' },
  { href: '/primitives/select', label: 'Select' },
  { href: '/primitives/separator', label: 'Separator' },
  { href: '/primitives/slider', label: 'Slider' },
  { href: '/primitives/switch', label: 'Switch' },
  { href: '/primitives/tabs', label: 'Tabs' },
  { href: '/primitives/toast', label: 'Toast' },
  { href: '/primitives/toggle', label: 'Toggle' },
  { href: '/primitives/toggle-group', label: 'Toggle Group' },
  { href: '/primitives/tooltip', label: 'Tooltip' },
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
