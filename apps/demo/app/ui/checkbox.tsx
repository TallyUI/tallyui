import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Checkbox, Label, Text, VStack } from '@tallyui/components';

export default function CheckboxScreen() {
  const [controlled, setControlled] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(true);

  return (
    <>
      <Stack.Screen options={{ title: 'Checkbox' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic</Text>
          <View className="flex-row items-center gap-2">
            <Checkbox
              checked={controlled}
              onCheckedChange={setControlled}
              nativeID="basic"
            />
            <Label nativeID="basic">
              <Text>Toggle me</Text>
            </Label>
          </View>
          <Text className="text-sm text-muted-foreground">
            State: {controlled ? 'checked' : 'unchecked'}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Labels</Text>
          <View className="flex-row items-center gap-2">
            <Checkbox
              checked={terms}
              onCheckedChange={setTerms}
              nativeID="terms"
            />
            <Label nativeID="terms">
              <Text>Accept terms and conditions</Text>
            </Label>
          </View>
          <View className="flex-row items-center gap-2">
            <Checkbox
              checked={marketing}
              onCheckedChange={setMarketing}
              nativeID="marketing"
            />
            <Label nativeID="marketing">
              <Text>Receive marketing emails</Text>
            </Label>
          </View>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <View className="flex-row items-center gap-2">
            <Checkbox disabled nativeID="disabled-off" />
            <Label nativeID="disabled-off">
              <Text className="text-muted-foreground">Disabled unchecked</Text>
            </Label>
          </View>
          <View className="flex-row items-center gap-2">
            <Checkbox disabled checked nativeID="disabled-on" />
            <Label nativeID="disabled-on">
              <Text className="text-muted-foreground">Disabled checked</Text>
            </Label>
          </View>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Form Example</Text>
          <Text className="text-sm text-muted-foreground">
            A typical signup form with multiple checkboxes.
          </Text>
          <View className="rounded-lg border border-border p-4 gap-3">
            <View className="flex-row items-start gap-2">
              <Checkbox
                checked={terms}
                onCheckedChange={setTerms}
                nativeID="form-terms"
              />
              <Label nativeID="form-terms" className="flex-1">
                <Text className="text-sm">
                  I agree to the Terms of Service and Privacy Policy
                </Text>
              </Label>
            </View>
            <View className="flex-row items-start gap-2">
              <Checkbox
                checked={marketing}
                onCheckedChange={setMarketing}
                nativeID="form-marketing"
              />
              <Label nativeID="form-marketing" className="flex-1">
                <Text className="text-sm">
                  Send me product updates and announcements
                </Text>
              </Label>
            </View>
          </View>
        </VStack>
      </ScrollView>
    </>
  );
}
