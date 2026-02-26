'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { OrderStatusBadge } from '@tallyui/components';

export default function Demo() {
  const statuses = ['pending', 'processing', 'completed', 'refunded', 'cancelled'];

  return (
    <View style={{ gap: 12 }}>
      {statuses.map((s) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 13, color: '#6b7280', width: 80 }}>{s}</Text>
          <OrderStatusBadge status={s} />
        </View>
      ))}
    </View>
  );
}`;

export function OrderStatusBadgeDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="OrderStatusBadge"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
