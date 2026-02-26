import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Switch, Label, Text, VStack } from '@tallyui/components';

export default function SwitchScreen() {
  const [controlled, setControlled] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [analytics, setAnalytics] = useState(true);

  return (
    <>
      <Stack.Screen options={{ title: 'Switch' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic</Text>
          <View className="flex-row items-center gap-3">
            <Switch
              checked={controlled}
              onCheckedChange={setControlled}
            />
            <Text>State: {controlled ? 'on' : 'off'}</Text>
          </View>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Labels</Text>
          <View className="flex-row items-center justify-between">
            <Label nativeID="notifications">
              <Text>Notifications</Text>
            </Label>
            <Switch
              checked={notifications}
              onCheckedChange={setNotifications}
              nativeID="notifications"
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Label nativeID="dark-mode">
              <Text>Dark mode</Text>
            </Label>
            <Switch
              checked={darkMode}
              onCheckedChange={setDarkMode}
              nativeID="dark-mode"
            />
          </View>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-muted-foreground">Disabled off</Text>
            <Switch disabled />
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-muted-foreground">Disabled on</Text>
            <Switch disabled checked />
          </View>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Settings Pattern</Text>
          <Text className="text-sm text-muted-foreground">
            Common layout for app settings screens.
          </Text>
          <VStack className="rounded-lg border border-border divide-y divide-border">
            <View className="flex-row items-center justify-between px-4 py-3">
              <VStack className="gap-0.5">
                <Text className="text-sm font-medium">Push notifications</Text>
                <Text className="text-xs text-muted-foreground">
                  Receive alerts on your device
                </Text>
              </VStack>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </View>
            <View className="flex-row items-center justify-between px-4 py-3">
              <VStack className="gap-0.5">
                <Text className="text-sm font-medium">Dark mode</Text>
                <Text className="text-xs text-muted-foreground">
                  Use the dark theme across the app
                </Text>
              </VStack>
              <Switch
                checked={darkMode}
                onCheckedChange={setDarkMode}
              />
            </View>
            <View className="flex-row items-center justify-between px-4 py-3">
              <VStack className="gap-0.5">
                <Text className="text-sm font-medium">Analytics</Text>
                <Text className="text-xs text-muted-foreground">
                  Help improve the app with usage data
                </Text>
              </VStack>
              <Switch
                checked={analytics}
                onCheckedChange={setAnalytics}
              />
            </View>
          </VStack>
        </VStack>
      </ScrollView>
    </>
  );
}
