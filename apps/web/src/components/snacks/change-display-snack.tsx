'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { ChangeDisplay } from '@tallyui/components';

export default function Demo() {
  return (
    <View style={{ gap: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Exact amount</Text>
      <ChangeDisplay change={{ amount: 0, currency: 'USD' }} />

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Change owed</Text>
      <ChangeDisplay change={{ amount: 750, currency: 'USD' }} />

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Large overpayment</Text>
      <ChangeDisplay change={{ amount: 6275, currency: 'USD' }} />
    </View>
  );
}`;

export function ChangeDisplayDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="ChangeDisplay"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
