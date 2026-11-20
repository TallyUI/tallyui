/**
 * Settings › Barcode scanning › Scanning: the four values the scanner engine takes
 * (`@tallyui/pos` `UseBarcodeScannerOptions`: threshold, minChars, prefix, suffix).
 * Port of WCPOS v2 `packages/core/src/screens/main/settings/barcode-scanning/settings.tsx`, its first section;
 * the labels are v2's English strings from core.json. Props-only: the app passes the values and saves each patch,
 * as v2 saves every change at once (there is no Save button).
 *
 * Left out, each a later row: v2's Sound section (TallyUI has no scan-sound player, so a switch would do nothing),
 * the Input sources / scanner chooser, and the test panel's key capture, timing chart and history. The app captures
 * keys and runs `analyzeScanTrace`; the optional test prop draws its verdict and applies suggestions through onChange.
 */
import { useState } from 'react';
import { View } from 'react-native';
import type { TraceAnalysis } from '@tallyui/pos';
import { CheckIcon } from '../ui/icon/check-icon';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { Text } from '../ui/text';
import { SettingsGroup } from './settings-group';
import { SettingsRow } from './settings-row';

export interface BarcodeScanningValues {
  /** Average gap between keys, in ms, below which a burst is a scan (v2 default 24). */
  threshold: number;
  /** Shortest code accepted as a scan (v2 default 8). */
  minChars: number;
  prefix: string;
  suffix: string;
}

export interface BarcodeScanningSettingsProps {
  values: BarcodeScanningValues;
  /** Called with only the field that changed, as soon as it holds a valid value. */
  onChange: (patch: Partial<BarcodeScanningValues>) => void;
  className?: string;
  /** v2's Barcode Scanning Test: drawn only when given. The app captures the keys and runs `analyzeScanTrace` with the
   *  current values; `analysis` is null before the first test scan. `capture` is the app's own capture field, drawn first. */
  test?: { analysis: TraceAnalysis | null; capture?: React.ReactNode };
}

const FIELD = 'h-11 w-28';

/**
 * A whole number ≥ 0, as v2's `z.coerce.number().int().min(0)` count field: digits only. While the text is empty it
 * reports nothing; on blur it shows the current value again (v2's form restores the stored value the same way).
 */
function CountField({ testID, label, value, onValue }: {
  testID: string; label: string; value: number; onValue: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  // The draft follows a new value from the app (saved, reset or applied elsewhere), adjusted during render.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }
  return (
    <Input className={FIELD}>
      <Input.Field
        testID={testID}
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={draft}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '');
          setDraft(digits);
          if (digits !== '') onValue(Number(digits));
        }}
        onBlur={() => { if (draft === '') setDraft(String(value)); }}
      />
    </Input>
  );
}

/** Plain controlled text, reported as typed: no trimming, since a scanner's prefix may be a space. */
function TextField({ testID, label, value, onValue }: {
  testID: string; label: string; value: string; onValue: (value: string) => void;
}) {
  return (
    <Input className={FIELD}>
      <Input.Field testID={testID} accessibilityLabel={label} value={value} onChangeText={onValue} />
    </Input>
  );
}

const THRESHOLD = 'Barcode Average Time Input Threshold (ms)';
const MIN_CHARS = 'Barcode Minimum Length';
const PREFIX = 'Barcode Scanner Prefix';
const SUFFIX = 'Barcode Scanner Suffix';

export function BarcodeScanningSettings({ values, onChange, className, test }: BarcodeScanningSettingsProps) {
  const analysis = test?.analysis;
  const avg = analysis ? Math.round(analysis.avgGapMs) : 0;
  return (<>
    <SettingsGroup title="Scanning" className={className}>
      <SettingsRow label={THRESHOLD} action={(
        <CountField testID="settings-barcode-threshold" label={THRESHOLD} value={values.threshold}
          onValue={(threshold) => onChange({ threshold })} />
      )} />
      <SettingsRow label={MIN_CHARS} action={(
        <CountField testID="settings-barcode-min-chars" label={MIN_CHARS} value={values.minChars}
          onValue={(minChars) => onChange({ minChars })} />
      )} />
      <SettingsRow label={PREFIX} action={(
        <TextField testID="settings-barcode-prefix" label={PREFIX} value={values.prefix}
          onValue={(prefix) => onChange({ prefix })} />
      )} />
      <SettingsRow label={SUFFIX} action={(
        <TextField testID="settings-barcode-suffix" label={SUFFIX} value={values.suffix}
          onValue={(suffix) => onChange({ suffix })} />
      )} />
    </SettingsGroup>
    {test && (
      <SettingsGroup title="Barcode Scanning Test">
        {test.capture}
        {analysis && (
          <View testID="barcode-test-verdict" className="gap-3 p-4">
            {analysis.detectedAsScan ? (
              <>
                <View className="flex-row items-center gap-2">
                  <CheckIcon className="text-success" />
                  <Text testID="barcode-test-headline">{`Detected as a scan → ${analysis.code}`}</Text>
                </View>
                <Text testID="barcode-test-detail" className="text-sm text-muted-foreground">
                  {`Average keystroke gap ${avg}ms, under the ${values.threshold}ms threshold`}
                </Text>
              </>
            ) : analysis.nearMiss ? (
              <Notice tone="warning" testID="barcode-test-headline"
                title={`Treated as typing — average gap ${avg}ms is above your ${values.threshold}ms threshold`} />
            ) : !Number.isFinite(analysis.avgGapMs) ? (
              <Text testID="barcode-test-headline">
                Treated as typing — only one key pressed, so there are no gaps to measure
              </Text>
            ) : (
              <Text testID="barcode-test-headline">
                {`Treated as typing (average gap ${avg}ms) — correctly ignored`}
              </Text>
            )}
            {analysis.suggestions.map((s) => (
              <Notice key={s.kind} tone="info" testID={`barcode-test-suggestion-${s.kind}`}
                title={s.kind === 'raise-threshold'
                  ? `Raise threshold to ${s.value}ms — your scanner averages ${avg}ms`
                  : s.kind === 'lower-min-chars'
                    ? `Lower minimum length to ${s.value} — this code is ${s.value} characters`
                    : `Strip leading "${s.value}" — set it as your prefix`}
                actions={[{ label: 'Apply', onPress: () => onChange(s.settings), testID: `barcode-test-apply-${s.kind}` }]} />
            ))}
            {analysis.shiftMangled && (
              <Notice tone="warning" testID="barcode-test-shift" title="Scanner is sending Shift as separate keys">
                <Text>Reconfigure it to a US-keyboard / no-modifier mode.</Text>
              </Notice>
            )}
            {analysis.trailingEnter && (
              <Text testID="barcode-test-trailing-enter" className="text-sm text-muted-foreground">
                Trailing Enter detected and ignored — no suffix needed
              </Text>
            )}
          </View>
        )}
      </SettingsGroup>
    )}
  </>);
}
