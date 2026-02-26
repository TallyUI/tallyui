'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { CashTendered } from '@tallyui/components';

export default function Demo() {
  const [amount, setAmount] = React.useState(50);

  return (
    <View style={{ gap: 24 }}>
      <View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>Auto-generated quick amounts</Text>
        <CashTendered total={42.50} />
      </View>

      <View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>Custom quick amounts</Text>
        <CashTendered total={18.75} quickAmounts={[20, 25, 50]} />
      </View>

      <View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>Controlled (selected: {amount.toFixed(2)})</Text>
        <CashTendered total={42.50} amount={amount} onChangeAmount={setAmount} />
      </View>
    </View>
  );
}`;

export function CashTenderedDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="CashTendered"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
