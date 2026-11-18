import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
  Button, Text, VStack, Input, Label,
  Popover, PopoverTrigger, PopoverContent,
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
          <Text className="text-lg font-bold">Left Sheet</Text>
          <Dialog>
            <DialogTrigger asChild>
              <Button testID="open-left-sheet"><Text>Open Left Sheet</Text></Button>
            </DialogTrigger>
            <DialogContent side="left" testID="demo-left-sheet">
              <DialogHeader>
                <DialogTitle>Left sheet</DialogTitle>
                <DialogDescription>Slides in from the left edge.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button testID="demo-left-sheet-done"><Text>Done</Text></Button>
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
      </ScrollView>
    </>
  );
}
