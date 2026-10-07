'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { CashTendered } from '@tallyui/components';

const usd = (major) => ({ amount: Math.round(major * 100), currency: 'USD' });

export default function Demo() {
  const [amount, setAmount] = React.useState(usd(50));

  return (
    <View style={{ gap: 24 }}>
      <View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>Auto-generated quick amounts</Text>
        <CashTendered total={usd(42.5)} />
      </View>

      <View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>Custom quick amounts</Text>
        <CashTendered total={usd(18.75)} quickAmounts={[usd(20), usd(25), usd(50)]} />
      </View>

      <View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>Controlled (selected: {(amount.amount / 100).toFixed(2)})</Text>
        <CashTendered total={usd(42.5)} amount={amount} onChangeAmount={setAmount} />
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
