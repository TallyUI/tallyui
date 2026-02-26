import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
  Button, Text, VStack, Input, Label,
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
      </ScrollView>
      <PortalHost />
    </>
  );
}
