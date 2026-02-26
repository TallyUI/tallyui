'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { SettingsGroup, SettingsRow } from '@tallyui/components';

export default function Demo() {
  const [darkMode, setDarkMode] = React.useState(false);
  const [notifications, setNotifications] = React.useState(true);
  const [sounds, setSounds] = React.useState(false);

  return (
    <View style={styles.container}>
      <SettingsGroup title="Appearance" description="Customize the look and feel">
        <SettingsRow
          label="Dark Mode"
          description="Use dark color scheme"
          action={<Switch value={darkMode} onValueChange={setDarkMode} />}
        />
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsRow
          label="Push Notifications"
          description="Get alerts for new orders"
          action={<Switch value={notifications} onValueChange={setNotifications} />}
        />
        <SettingsRow
          label="Sound Effects"
          action={<Switch value={sounds} onValueChange={setSounds} />}
        />
      </SettingsGroup>

      <SettingsGroup title="About">
        <SettingsRow label="Version" action={<Text style={styles.meta}>1.4.2</Text>} />
        <SettingsRow label="Build" action={<Text style={styles.meta}>2026.02.26</Text>} />
      </SettingsGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa', gap: 16 },
  meta: { fontSize: 13, color: '#6b7280' },
});`;

export function SettingsGroupDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="SettingsGroup"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
