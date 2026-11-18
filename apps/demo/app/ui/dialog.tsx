import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
  Button, Text, VStack, Input, Label,
  Popover, PopoverTrigger, PopoverContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  HoverCard, HoverCardTrigger, HoverCardContent,
  Tooltip, TooltipTrigger, TooltipContent,
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@tallyui/components';

export default function DialogScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Dialog' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Dialog</Text>
          <Dialog>
            <DialogTrigger asChild>
              <Button><Text>Open Dialog</Text></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Welcome</DialogTitle>
                <DialogDescription>
                  This is a basic dialog with a title and description.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button><Text>Got it</Text></Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Side Sheet</Text>
          <Dialog>
            <DialogTrigger asChild>
              <Button testID="open-side-sheet"><Text>Open Side Sheet</Text></Button>
            </DialogTrigger>
            <DialogContent side="right" testID="demo-side-sheet">
              <DialogHeader>
                <DialogTitle>Side sheet</DialogTitle>
                <DialogDescription>Slides in from the right edge.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button testID="demo-side-sheet-done"><Text>Done</Text></Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Edit Profile Dialog</Text>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline"><Text>Edit Profile</Text></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Profile</DialogTitle>
                <DialogDescription>
                  Make changes to your profile here. Press save when you're done.
                </DialogDescription>
              </DialogHeader>
              <VStack className="gap-4">
                <VStack className="gap-1.5">
                  <Label>Name</Label>
                  <Input>
                    <Input.Field defaultValue="Jane Doe" />
                  </Input>
                </VStack>
                <VStack className="gap-1.5">
                  <Label>Username</Label>
                  <Input>
                    <Input.Field defaultValue="@janedoe" />
                  </Input>
                </VStack>
              </VStack>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline"><Text>Cancel</Text></Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button><Text>Save</Text></Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Controlled Dialog</Text>
          <Text className="text-sm text-muted-foreground">
            State: {controlled ? 'OPEN' : 'CLOSED'}
          </Text>
          <Dialog open={controlled} onOpenChange={setControlled}>
            <DialogTrigger asChild>
              <Button variant="secondary"><Text>Open Controlled</Text></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Controlled Dialog</DialogTitle>
                <DialogDescription>
                  This dialog's open state is managed externally.
                  Current state: {controlled ? 'open' : 'closed'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onPress={() => setControlled(false)}>
                  <Text>Close via State</Text>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Popover in a Dialog</Text>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline"><Text>Open dialog with a popover</Text></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Dialog with a popover</DialogTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline"><Text>Open nested popover</Text></Button>
                </PopoverTrigger>
                <PopoverContent>
                  <Text className="text-sm font-medium">Nested Popover Content</Text>
                </PopoverContent>
              </Popover>
            </DialogContent>
          </Dialog>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Overlays in a Dialog</Text>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline"><Text>Open dialog with overlays</Text></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Dialog with overlays</DialogTitle>
              <VStack className="items-start gap-3">
                <Select>
                  <SelectTrigger className="w-48" testID="nested-select-trigger">
                    <SelectValue placeholder="Pick a size" />
                  </SelectTrigger>
                  <SelectContent testID="nested-select-content">
                    <SelectItem value="small" label="Small">Small</SelectItem>
                    <SelectItem value="large" label="Large">Large</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" testID="nested-dropdown-menu-trigger"><Text>Open nested menu</Text></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent testID="nested-dropdown-menu-content">
                    <DropdownMenuItem><Text>Nested menu item</Text></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Button variant="outline" testID="nested-hover-card-trigger"><Text>Nested hover card</Text></Button>
                  </HoverCardTrigger>
                  <HoverCardContent testID="nested-hover-card-content">
                    <Text className="text-sm">Nested hover card content</Text>
                  </HoverCardContent>
                </HoverCard>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" testID="nested-tooltip-trigger"><Text>Nested tooltip</Text></Button>
                  </TooltipTrigger>
                  <TooltipContent testID="nested-tooltip-content">
                    <Text>Nested tooltip content</Text>
                  </TooltipContent>
                </Tooltip>
                <ContextMenu>
                  <ContextMenuTrigger testID="nested-context-menu-trigger">
                    <View className="h-16 w-56 items-center justify-center rounded-md border border-dashed border-border">
                      <Text className="text-sm text-muted-foreground">Long-press for nested menu</Text>
                    </View>
                  </ContextMenuTrigger>
                  <ContextMenuContent testID="nested-context-menu-content">
                    <ContextMenuItem><Text>Nested context item</Text></ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </VStack>
            </DialogContent>
          </Dialog>
        </VStack>
      </ScrollView>
    </>
  );
}
