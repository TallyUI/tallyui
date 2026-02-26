import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Label, Input, Textarea, Text, VStack, HStack } from '@tallyui/components';

export default function LabelScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Label' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Label</Text>
          <Label nativeID="basic">Full name</Label>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Label with Input</Text>
          <VStack className="gap-1.5">
            <Label nativeID="email">Email address</Label>
            <Input>
              <Input.Field placeholder="you@example.com" aria-labelledby="email" />
            </Input>
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Label with Textarea</Text>
          <VStack className="gap-1.5">
            <Label nativeID="bio">Bio</Label>
            <Textarea placeholder="Tell us about yourself" aria-labelledby="bio" />
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Required Field</Text>
          <VStack className="gap-1.5">
            <HStack className="gap-1">
              <Label nativeID="required-field">Password</Label>
              <Text className="text-destructive">*</Text>
            </HStack>
            <Input>
              <Input.Field
                placeholder="Enter password"
                secureTextEntry
                aria-labelledby="required-field"
              />
            </Input>
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Custom Styling</Text>
          <Label className="text-base text-muted-foreground">Optional notes</Label>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Section header
          </Label>
        </VStack>
      </ScrollView>
    </>
  );
}
