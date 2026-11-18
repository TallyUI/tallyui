import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { BarcodeScanningSettings, type BarcodeScanningValues } from '@tallyui/components';

// WCPOS v2's defaults. The app would save each patch to its settings; the demo keeps the values in state.
const DEFAULTS: BarcodeScanningValues = { threshold: 24, minChars: 8, prefix: '', suffix: '' };

export default function BarcodeScanningSettingsScreen() {
  const [values, setValues] = useState(DEFAULTS);
  return (
    <>
      <Stack.Screen options={{ title: 'BarcodeScanningSettings' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4">
        <BarcodeScanningSettings values={values}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} />
        <Text testID="demo-barcode-saved" className="px-4 text-xs text-muted-foreground">
          {`Saved: threshold ${values.threshold} ms · minimum length ${values.minChars} · prefix ${
            JSON.stringify(values.prefix)} · suffix ${JSON.stringify(values.suffix)}`}
        </Text>
      </ScrollView>
    </>
  );
}
