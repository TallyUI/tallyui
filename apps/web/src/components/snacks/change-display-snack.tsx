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
      <ChangeDisplay tendered={25} total={25} />

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Change owed</Text>
      <ChangeDisplay tendered={50} total={42.50} />

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Large overpayment</Text>
      <ChangeDisplay tendered={100} total={37.25} />
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
