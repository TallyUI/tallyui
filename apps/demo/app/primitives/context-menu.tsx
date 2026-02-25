import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ContextMenu, PortalHost } from '@tallyui/primitives';

export default function ContextMenuScreen() {
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(false);
  const [theme, setTheme] = useState('light');

  return (
    <>
      <Stack.Screen options={{ title: 'Context Menu' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Basic Items ---- */}
        <Text style={s.heading}>Basic Items</Text>
        <Text style={s.info}>Long-press the area below to open the context menu.</Text>
        <ContextMenu.Root>
          <ContextMenu.Trigger style={s.triggerArea}>
            <Text style={s.triggerText}>Long-press me</Text>
          </ContextMenu.Trigger>

          <ContextMenu.Portal>
            <ContextMenu.Overlay style={s.overlay} />
            <ContextMenu.Content style={s.content} disablePositioningStyle>
              <ContextMenu.Label>
                <Text style={s.label}>Edit</Text>
              </ContextMenu.Label>
              <ContextMenu.Item textValue="Cut" onPress={() => {}}>
                <Text style={s.itemText}>Cut</Text>
              </ContextMenu.Item>
              <ContextMenu.Item textValue="Copy" onPress={() => {}}>
                <Text style={s.itemText}>Copy</Text>
              </ContextMenu.Item>
              <ContextMenu.Separator style={s.separator} decorative />
              <ContextMenu.Item textValue="Paste" onPress={() => {}}>
                <Text style={s.itemText}>Paste</Text>
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>

        {/* ---- Checkbox Items ---- */}
        <Text style={s.heading}>Checkbox Items</Text>
        <Text style={s.info}>
          Grid: {showGrid ? 'ON' : 'OFF'} | Rulers: {showRulers ? 'ON' : 'OFF'}
        </Text>

        <ContextMenu.Root>
          <ContextMenu.Trigger style={s.triggerArea}>
            <Text style={s.triggerText}>Long-press for view options</Text>
          </ContextMenu.Trigger>

          <ContextMenu.Portal>
            <ContextMenu.Overlay style={s.overlay} />
            <ContextMenu.Content style={s.content} disablePositioningStyle>
              <ContextMenu.Label>
                <Text style={s.label}>View</Text>
              </ContextMenu.Label>
              <ContextMenu.CheckboxItem
                checked={showGrid}
                onCheckedChange={setShowGrid}
                textValue="Show Grid"
                closeOnPress={false}
                style={s.item}
              >
                <ContextMenu.ItemIndicator>
                  <Text style={s.check}>&#10003;</Text>
                </ContextMenu.ItemIndicator>
                <Text style={s.itemText}>Show Grid</Text>
              </ContextMenu.CheckboxItem>

              <ContextMenu.CheckboxItem
                checked={showRulers}
                onCheckedChange={setShowRulers}
                textValue="Show Rulers"
                closeOnPress={false}
                style={s.item}
              >
                <ContextMenu.ItemIndicator>
                  <Text style={s.check}>&#10003;</Text>
                </ContextMenu.ItemIndicator>
                <Text style={s.itemText}>Show Rulers</Text>
              </ContextMenu.CheckboxItem>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>

        {/* ---- Radio Group ---- */}
        <Text style={s.heading}>Radio Group</Text>
        <Text style={s.info}>Theme: {theme}</Text>

        <ContextMenu.Root>
          <ContextMenu.Trigger style={s.triggerArea}>
            <Text style={s.triggerText}>Long-press for theme options</Text>
          </ContextMenu.Trigger>

          <ContextMenu.Portal>
            <ContextMenu.Overlay style={s.overlay} />
            <ContextMenu.Content style={s.content} disablePositioningStyle>
              <ContextMenu.Label>
                <Text style={s.label}>Theme</Text>
              </ContextMenu.Label>
              <ContextMenu.RadioGroup value={theme} onValueChange={setTheme}>
                {['light', 'dark', 'system'].map((val) => (
                  <ContextMenu.RadioItem
                    key={val}
                    value={val}
                    textValue={val}
                    closeOnPress={false}
                    style={s.item}
                  >
                    <ContextMenu.ItemIndicator>
                      <Text style={s.radio}>&#9679;</Text>
                    </ContextMenu.ItemIndicator>
                    <Text style={s.itemText}>{val.charAt(0).toUpperCase() + val.slice(1)}</Text>
                  </ContextMenu.RadioItem>
                ))}
              </ContextMenu.RadioGroup>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </ScrollView>
      <PortalHost />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  triggerArea: {
    backgroundColor: '#f3f4f6',
    padding: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  triggerText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  content: {
    position: 'absolute',
    top: '30%',
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
    textTransform: 'uppercase',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 8,
  },
  itemText: { fontSize: 15, color: '#111827' },
  check: { color: '#6366f1', fontWeight: '700', fontSize: 14 },
  radio: { color: '#6366f1', fontSize: 10 },
  separator: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
    marginHorizontal: 6,
  },
});
