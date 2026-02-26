'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { OrderCard } from '@tallyui/components';

export default function Demo() {
  return (
    <View style={{ gap: 12 }}>
      <OrderCard
        orderNumber="#1042"
        date="Feb 26, 2026"
        total="$48.50"
        status="completed"
        customerName="Jane Smith"
      />

      <OrderCard
        orderNumber="#1043"
        date="Feb 26, 2026"
        total="$12.00"
        status="pending"
      />

      <OrderCard
        orderNumber="#1044"
        date="Feb 25, 2026"
        total="$95.75"
        status="refunded"
        customerName="Bob Wilson"
        onPress={() => {}}
      />
    </View>
  );
}`;

export function OrderCardDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="OrderCard"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
