'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { SettingsRow } from '@tallyui/components';

export default function Demo() {
  const [darkMode, setDarkMode] = React.useState(false);
  const [notifications, setNotifications] = React.useState(true);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <SettingsRow
          label="Dark Mode"
          description="Use dark color scheme"
          action={<Switch value={darkMode} onValueChange={setDarkMode} />}
        />
        <View style={styles.divider} />
        <SettingsRow
          label="Notifications"
          description="Receive push notifications"
          action={<Switch value={notifications} onValueChange={setNotifications} />}
        />
        <View style={styles.divider} />
        <SettingsRow
          label="Version"
          description="Current app version"
          action={<Text style={styles.versionText}>1.4.2</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa', gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: '#e5e7eb' },
  versionText: { fontSize: 13, color: '#6b7280' },
});`;

export function SettingsRowDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="SettingsRow"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
