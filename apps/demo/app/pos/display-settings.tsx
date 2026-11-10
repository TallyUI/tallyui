import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { DisplaySettings, type DisplaySettingsProps } from '@tallyui/components';
import { DEFAULT_APP_SETTINGS } from '@tallyui/pos';

// The app passes `useAppSettings(db.app_settings)`; the demo keeps the values in state.
export default function DisplaySettingsScreen() {
  const [settings, setSettings] = useState<DisplaySettingsProps['settings']>(DEFAULT_APP_SETTINGS);
  const setSetting: DisplaySettingsProps['setSetting'] = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    return Promise.resolve();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'DisplaySettings' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4">
        <DisplaySettings settings={settings} setSetting={setSetting} />
      </ScrollView>
    </>
  );
}
