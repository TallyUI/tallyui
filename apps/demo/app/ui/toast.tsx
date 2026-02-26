import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  Toast, ToastTitle, ToastDescription, ToastClose,
  Button, Text, VStack,
} from '@tallyui/components';

export default function ToastScreen() {
  const [toasts, setToasts] = useState<
    { id: number; variant: 'default' | 'destructive' | 'success'; title: string; description: string }[]
  >([]);

  let nextId = 0;
  function addToast(variant: 'default' | 'destructive' | 'success', title: string, description: string) {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, variant, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function removeToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Toast' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Toast Variants (Static)</Text>
          <Toast>
            <VStack className="gap-1 flex-1">
              <ToastTitle>Default Toast</ToastTitle>
              <ToastDescription>This is a default notification.</ToastDescription>
            </VStack>
            <ToastClose />
          </Toast>

          <Toast variant="destructive">
            <VStack className="gap-1 flex-1">
              <ToastTitle>Error</ToastTitle>
              <ToastDescription>Something went wrong. Please try again.</ToastDescription>
            </VStack>
            <ToastClose />
          </Toast>

          <Toast variant="success">
            <VStack className="gap-1 flex-1">
              <ToastTitle>Success</ToastTitle>
              <ToastDescription>Your changes have been saved.</ToastDescription>
            </VStack>
            <ToastClose />
          </Toast>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Title Only</Text>
          <Toast>
            <ToastTitle>Copied to clipboard</ToastTitle>
          </Toast>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Action</Text>
          <Toast>
            <VStack className="gap-1 flex-1">
              <ToastTitle>Undo Available</ToastTitle>
              <ToastDescription>Item moved to trash.</ToastDescription>
            </VStack>
            <Button variant="outline" size="sm">
              <Text>Undo</Text>
            </Button>
            <ToastClose />
          </Toast>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Trigger Toasts</Text>
          <Text className="text-sm text-muted-foreground">
            Press a button to show a toast that auto-dismisses after 4 seconds.
          </Text>
          <VStack className="gap-2">
            <Button
              onPress={() => addToast('default', 'Notification', 'Something happened.')}
            >
              <Text>Show Default Toast</Text>
            </Button>
            <Button
              variant="destructive"
              onPress={() => addToast('destructive', 'Error', 'Operation failed.')}
            >
              <Text>Show Destructive Toast</Text>
            </Button>
            <Button
              variant="secondary"
              onPress={() => addToast('success', 'Saved', 'Your changes have been saved.')}
            >
              <Text>Show Success Toast</Text>
            </Button>
          </VStack>
        </VStack>
      </ScrollView>

      {/* Live toast stack */}
      <View className="absolute bottom-4 left-4 right-4 gap-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} variant={toast.variant}>
            <VStack className="gap-1 flex-1">
              <ToastTitle>{toast.title}</ToastTitle>
              <ToastDescription>{toast.description}</ToastDescription>
            </VStack>
            <ToastClose onPress={() => removeToast(toast.id)} />
          </Toast>
        ))}
      </View>
    </>
  );
}
