import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { DropdownMenu, PortalHost } from '@tallyui/primitives';

export default function DropdownMenuScreen() {
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [sortBy, setSortBy] = useState('name');

  return (
    <>
      <Stack.Screen options={{ title: 'Dropdown Menu' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Basic Items ---- */}
        <Text style={s.heading}>Basic Items</Text>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Text style={s.btn}>Open Menu</Text>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Overlay style={s.overlay} />
            <DropdownMenu.Content style={s.content} disablePositioningStyle>
              <DropdownMenu.Label>
                <Text style={s.label}>Actions</Text>
              </DropdownMenu.Label>
              <DropdownMenu.Item textValue="New Tab" onPress={() => {}}>
                <Text style={s.itemText}>New Tab</Text>
              </DropdownMenu.Item>
              <DropdownMenu.Item textValue="New Window" onPress={() => {}}>
                <Text style={s.itemText}>New Window</Text>
              </DropdownMenu.Item>
              <DropdownMenu.Separator style={s.separator} decorative />
              <DropdownMenu.Item textValue="Settings" onPress={() => {}}>
                <Text style={s.itemText}>Settings</Text>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* ---- Checkbox Items ---- */}
        <Text style={s.heading}>Checkbox Items</Text>
        <Text style={s.info}>
          Bookmarks: {showBookmarks ? 'ON' : 'OFF'} | History: {showHistory ? 'ON' : 'OFF'}
        </Text>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Text style={s.btn}>Toggle Features</Text>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Overlay style={s.overlay} />
            <DropdownMenu.Content style={s.content} disablePositioningStyle>
              <DropdownMenu.Label>
                <Text style={s.label}>Show</Text>
              </DropdownMenu.Label>
              <DropdownMenu.CheckboxItem
                checked={showBookmarks}
                onCheckedChange={setShowBookmarks}
                textValue="Bookmarks"
                closeOnPress={false}
                style={s.item}
              >
                <DropdownMenu.ItemIndicator>
                  <Text style={s.check}>&#10003;</Text>
                </DropdownMenu.ItemIndicator>
                <Text style={s.itemText}>Bookmarks</Text>
              </DropdownMenu.CheckboxItem>

              <DropdownMenu.CheckboxItem
                checked={showHistory}
                onCheckedChange={setShowHistory}
                textValue="History"
                closeOnPress={false}
                style={s.item}
              >
                <DropdownMenu.ItemIndicator>
                  <Text style={s.check}>&#10003;</Text>
                </DropdownMenu.ItemIndicator>
                <Text style={s.itemText}>History</Text>
              </DropdownMenu.CheckboxItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* ---- Radio Group ---- */}
        <Text style={s.heading}>Radio Group</Text>
        <Text style={s.info}>Sort by: {sortBy}</Text>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Text style={s.btn}>Sort Options</Text>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Overlay style={s.overlay} />
            <DropdownMenu.Content style={s.content} disablePositioningStyle>
              <DropdownMenu.Label>
                <Text style={s.label}>Sort By</Text>
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={sortBy} onValueChange={setSortBy}>
                {['name', 'date', 'size'].map((val) => (
                  <DropdownMenu.RadioItem
                    key={val}
                    value={val}
                    textValue={val}
                    closeOnPress={false}
                    style={s.item}
                  >
                    <DropdownMenu.ItemIndicator>
                      <Text style={s.radio}>&#9679;</Text>
                    </DropdownMenu.ItemIndicator>
                    <Text style={s.itemText}>{val.charAt(0).toUpperCase() + val.slice(1)}</Text>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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
  btn: {
    backgroundColor: '#6366f1',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
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
