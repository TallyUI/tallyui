import React from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Textarea, Label, Text, VStack } from '@tallyui/components';

export default function TextareaScreen() {
  const [charCount, setCharCount] = React.useState('');

  return (
    <>
      <Stack.Screen options={{ title: 'Textarea' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Textarea</Text>
          <Textarea placeholder="Write something..." />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Label</Text>
          <VStack className="gap-1.5">
            <Label nativeID="demo-message">Message</Label>
            <Textarea placeholder="Your message here..." aria-labelledby="demo-message" />
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Custom Height</Text>
          <Textarea className="min-h-[160px]" placeholder="Long-form content..." />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Character Limit</Text>
          <VStack className="gap-1.5">
            <Label nativeID="demo-tweet">Post</Label>
            <Textarea
              value={charCount}
              onChangeText={setCharCount}
              maxLength={280}
              placeholder="What's happening?"
              aria-labelledby="demo-tweet"
            />
            <Text className="text-sm text-muted-foreground text-right">
              {charCount.length}/280
            </Text>
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Read-only</Text>
          <Textarea
            editable={false}
            value="This content cannot be edited. It is displayed in a read-only textarea for reference."
          />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Default Value</Text>
          <VStack className="gap-1.5">
            <Label nativeID="demo-bio">Bio</Label>
            <Textarea
              defaultValue="Full-stack developer who loves building cross-platform apps with React Native."
              aria-labelledby="demo-bio"
            />
          </VStack>
        </VStack>
      </ScrollView>
    </>
  );
}
