import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { SettingsGroup, SettingsRow, Text, Switch } from '@tallyui/components';

export default function SettingsGroupScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'SettingsGroup' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <SettingsGroup title="General" description="Basic application settings">
          <SettingsRow label="Dark Mode" description="Use dark theme" action={<Switch />} />
          <SettingsRow label="Notifications" description="Enable push notifications" action={<Switch />} />
          <SettingsRow label="Language" action={<Text className="text-sm text-muted-foreground">English</Text>} />
        </SettingsGroup>

        <SettingsGroup title="Receipt" description="Configure receipt printing">
          <SettingsRow label="Auto Print" description="Print receipt after each sale" action={<Switch />} />
          <SettingsRow label="Paper Size" action={<Text className="text-sm text-muted-foreground">80mm</Text>} />
        </SettingsGroup>

        <SettingsGroup title="Danger Zone">
          <SettingsRow label="Reset All Settings" description="This cannot be undone" />
        </SettingsGroup>
      </ScrollView>
    </>
  );
}
