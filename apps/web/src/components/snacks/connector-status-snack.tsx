'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ConnectorStatus } from '@tallyui/components';

export default function Demo() {
  return (
    <View style={styles.container}>
      <ConnectorStatus
        name="WooCommerce"
        status="connected"
        lastSync="2 minutes ago"
      />
      <ConnectorStatus
        name="Medusa"
        status="syncing"
        lastSync="Syncing now..."
      />
      <ConnectorStatus
        name="Shopify"
        status="error"
        lastSync="1 hour ago"
        error="Authentication token expired"
      />
      <ConnectorStatus
        name="Vendure"
        status="disconnected"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa', gap: 12 },
});`;

export function ConnectorStatusDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="ConnectorStatus"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
