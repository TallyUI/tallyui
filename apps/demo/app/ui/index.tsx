import { View, Text, Pressable, ScrollView } from 'react-native';
import { Link, Stack } from 'expo-router';

const screens = [
  // Core
  { href: '/ui/text', label: 'Text' },
  { href: '/ui/hstack', label: 'HStack' },
  { href: '/ui/vstack', label: 'VStack' },
  // Visual
  { href: '/ui/icon', label: 'Icon' },
  { href: '/ui/loader', label: 'Loader' },
  { href: '/ui/badge', label: 'Badge' },
  { href: '/ui/avatar', label: 'Avatar' },
  // Interactive
  { href: '/ui/button', label: 'Button' },
  { href: '/ui/icon-button', label: 'IconButton' },
  // Form
  { href: '/ui/label', label: 'Label' },
  { href: '/ui/input', label: 'Input' },
  { href: '/ui/textarea', label: 'Textarea' },
  { href: '/ui/checkbox', label: 'Checkbox' },
  { href: '/ui/switch', label: 'Switch' },
  { href: '/ui/radio-group', label: 'RadioGroup' },
  { href: '/ui/toggle', label: 'Toggle' },
  { href: '/ui/toggle-group', label: 'ToggleGroup' },
  { href: '/ui/slider', label: 'Slider' },
  { href: '/ui/progress', label: 'Progress' },
  // Containers
  { href: '/ui/card', label: 'Card' },
  { href: '/ui/separator', label: 'Separator' },
  { href: '/ui/tabs', label: 'Tabs' },
  { href: '/ui/accordion', label: 'Accordion' },
  { href: '/ui/collapsible', label: 'Collapsible' },
  // Overlay
  { href: '/ui/dialog', label: 'Dialog' },
  { href: '/ui/alert-dialog', label: 'AlertDialog' },
  { href: '/ui/popover', label: 'Popover' },
  { href: '/ui/tooltip', label: 'Tooltip' },
  { href: '/ui/hover-card', label: 'HoverCard' },
  { href: '/ui/toast', label: 'Toast' },
  // Menu
  { href: '/ui/select', label: 'Select' },
  { href: '/ui/combobox', label: 'Combobox' },
  { href: '/ui/dropdown-menu', label: 'DropdownMenu' },
  { href: '/ui/context-menu', label: 'ContextMenu' },
  // Data
  { href: '/ui/table', label: 'Table' },
] as const;

export default function UIIndex() {
  return (
    <>
      <Stack.Screen options={{ title: 'UI Components' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#fff' }}
        contentContainerStyle={{ padding: 16, gap: 8 }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>
          Styled components built on @tallyui/primitives. Tap to see variants.
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
