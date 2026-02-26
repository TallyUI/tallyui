import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioItem,
  ContextMenuLabel, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
  ContextMenuRadioGroup,
  Text, VStack,
} from '@tallyui/components';

export default function ContextMenuScreen() {
  const [showHidden, setShowHidden] = useState(false);
  const [showExtensions, setShowExtensions] = useState(true);
  const [viewMode, setViewMode] = useState('list');

  return (
    <>
      <Stack.Screen options={{ title: 'ContextMenu' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Context Menu</Text>
          <Text className="text-sm text-muted-foreground">
            Right-click (web) or long-press (native) the area below.
          </Text>
          <ContextMenu>
            <ContextMenuTrigger>
              <View className="h-32 items-center justify-center rounded-md border border-dashed border-border">
                <Text className="text-muted-foreground">Right-click here</Text>
              </View>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>
                <Text>Cut</Text>
              </ContextMenuItem>
              <ContextMenuItem>
                <Text>Copy</Text>
              </ContextMenuItem>
              <ContextMenuItem>
                <Text>Paste</Text>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem>
                <Text>Select All</Text>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Checkbox and Radio Items</Text>
          <Text className="text-sm text-muted-foreground">
            Toggle file visibility options and select a view mode.
          </Text>
          <ContextMenu>
            <ContextMenuTrigger>
              <View className="h-36 items-center justify-center rounded-md border border-dashed border-border">
                <Text className="text-muted-foreground">File manager area</Text>
              </View>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuLabel>Display</ContextMenuLabel>
              <ContextMenuSeparator />
              <ContextMenuCheckboxItem
                checked={showHidden}
                onCheckedChange={setShowHidden}
              >
                <Text>Show Hidden Files</Text>
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem
                checked={showExtensions}
                onCheckedChange={setShowExtensions}
              >
                <Text>Show Extensions</Text>
              </ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              <ContextMenuLabel>View</ContextMenuLabel>
              <ContextMenuRadioGroup value={viewMode} onValueChange={setViewMode}>
                <ContextMenuRadioItem value="list">
                  <Text>List</Text>
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="grid">
                  <Text>Grid</Text>
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="columns">
                  <Text>Columns</Text>
                </ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuContent>
          </ContextMenu>
          <Text className="text-sm text-muted-foreground">
            Hidden: {showHidden ? 'on' : 'off'} | Extensions: {showExtensions ? 'on' : 'off'} | View: {viewMode}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Sub-menu</Text>
          <ContextMenu>
            <ContextMenuTrigger>
              <View className="h-32 items-center justify-center rounded-md border border-dashed border-border">
                <Text className="text-muted-foreground">Right-click for nested menu</Text>
              </View>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>
                <Text>Undo</Text>
              </ContextMenuItem>
              <ContextMenuItem>
                <Text>Redo</Text>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Text>More Tools</Text>
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem>
                    <Text>Save As...</Text>
                  </ContextMenuItem>
                  <ContextMenuItem>
                    <Text>Export PDF</Text>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem>
                    <Text>Print</Text>
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuContent>
          </ContextMenu>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
