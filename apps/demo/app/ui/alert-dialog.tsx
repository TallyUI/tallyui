import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
  Button, Text, VStack,
} from '@tallyui/components';

export default function AlertDialogScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Alert Dialog' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Destructive Confirmation</Text>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive"><Text>Delete Account</Text></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. Your account and all associated data
                  will be permanently deleted from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline"><Text>Cancel</Text></Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button variant="destructive"><Text>Delete</Text></Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Discard Changes</Text>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline"><Text>Discard Changes</Text></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  You have unsaved changes. If you leave now, your edits will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline"><Text>Keep Editing</Text></Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button><Text>Discard</Text></Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Controlled Alert Dialog</Text>
          <Text className="text-sm text-muted-foreground">
            State: {controlled ? 'OPEN' : 'CLOSED'}
          </Text>
          <AlertDialog open={controlled} onOpenChange={setControlled}>
            <AlertDialogTrigger asChild>
              <Button variant="secondary"><Text>Open Controlled</Text></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Action</AlertDialogTitle>
                <AlertDialogDescription>
                  Open state is managed externally. Current: {controlled ? 'true' : 'false'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline"><Text>Cancel</Text></Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button><Text>Confirm</Text></Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
