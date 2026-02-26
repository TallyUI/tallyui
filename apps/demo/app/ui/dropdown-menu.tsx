import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  Button, Text, VStack,
} from '@tallyui/components';

export default function DropdownMenuScreen() {
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [sort, setSort] = useState('date');

  return (
    <>
      <Stack.Screen options={{ title: 'DropdownMenu' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Menu</Text>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Text>Open Menu</Text>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Text>Profile</Text>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Text>Settings</Text>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Text>Notifications</Text>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Text>Log out</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Checkbox Items</Text>
          <Text className="text-sm text-muted-foreground">
            Toggle visibility of UI elements.
          </Text>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Text>View Options</Text>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showStatusBar}
                onCheckedChange={setShowStatusBar}
              >
                <Text>Status Bar</Text>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showPanel}
                onCheckedChange={setShowPanel}
              >
                <Text>Side Panel</Text>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showToolbar}
                onCheckedChange={setShowToolbar}
              >
                <Text>Toolbar</Text>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Text className="text-sm text-muted-foreground">
            Status bar: {showStatusBar ? 'on' : 'off'} | Panel: {showPanel ? 'on' : 'off'} | Toolbar: {showToolbar ? 'on' : 'off'}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Radio Group</Text>
          <Text className="text-sm text-muted-foreground">
            Pick a sort order.
          </Text>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Text>Sort By: {sort}</Text>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Sort Order</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                <DropdownMenuRadioItem value="date">
                  <Text>Date</Text>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name">
                  <Text>Name</Text>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="size">
                  <Text>Size</Text>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="type">
                  <Text>Type</Text>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Sub-menu</Text>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Text>Actions</Text>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <Text>Cut</Text>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Text>Copy</Text>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Text>Paste</Text>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Text>Share via...</Text>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>
                    <Text>Email</Text>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Text>Slack</Text>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Text>Copy Link</Text>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
