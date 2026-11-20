import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { BarcodeScanningSettings, type BarcodeScanningValues } from '@tallyui/components';
import type { TraceAnalysis } from '@tallyui/pos';

// WCPOS v2's defaults. The app would save each patch to its settings; the demo keeps the values in state.
const DEFAULTS: BarcodeScanningValues = { threshold: 24, minChars: 8, prefix: '', suffix: '' };

// Fixed demo verdicts, not a live capture.
const FIXTURES: Record<'scan' | 'near' | 'typing', TraceAnalysis> = {
  scan: {
    raw: '0123', code: '0123', avgGapMs: 9, gaps: [0, 9, 9, 9, 9],
    detectedAsScan: true, tooShort: true, nearMiss: false, leadingSymbol: null,
    trailingEnter: true, shiftMangled: false,
    suggestions: [{ kind: 'lower-min-chars', value: 4, settings: { minChars: 4 } }],
  },
  near: {
    raw: '01234567', code: '', avgGapMs: 31.2, gaps: [0, 31.2, 31.2, 31.2, 31.2, 31.2, 31.2, 31.2, 31.2, 31.2],
    detectedAsScan: false, tooShort: false, nearMiss: true, leadingSymbol: null,
    trailingEnter: false, shiftMangled: true,
    suggestions: [{ kind: 'raise-threshold', value: 40, settings: { threshold: 40 } }],
  },
  typing: {
    raw: 'hello', code: '', avgGapMs: 180, gaps: [0, 180, 180, 180, 180],
    detectedAsScan: false, tooShort: false, nearMiss: false, leadingSymbol: null,
    trailingEnter: false, shiftMangled: false, suggestions: [],
  },
};

export default function BarcodeScanningSettingsScreen() {
  const [values, setValues] = useState(DEFAULTS);
  const { verdict } = useLocalSearchParams<{ verdict?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'BarcodeScanningSettings' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4">
        <BarcodeScanningSettings values={values}
          test={verdict === 'scan' || verdict === 'near' || verdict === 'typing' ? { analysis: FIXTURES[verdict] } : undefined}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} />
        <Text testID="demo-barcode-saved" className="px-4 text-xs text-muted-foreground">
          {`Saved: threshold ${values.threshold} ms · minimum length ${values.minChars} · prefix ${
            JSON.stringify(values.prefix)} · suffix ${JSON.stringify(values.suffix)}`}
        </Text>
      </ScrollView>
    </>
  );
}
