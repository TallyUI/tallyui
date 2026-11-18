/**
 * Settings › Barcode scanning › Scanning: the four values the scanner engine takes
 * (`@tallyui/pos` `UseBarcodeScannerOptions`: threshold, minChars, prefix, suffix).
 * Port of WCPOS v2 `packages/core/src/screens/main/settings/barcode-scanning/settings.tsx`, its first section;
 * the labels are v2's English strings from core.json. Props-only: the app passes the values and saves each patch,
 * as v2 saves every change at once (there is no Save button).
 *
 * Left out, each a later row: v2's Sound section (TallyUI has no scan-sound player, so a switch would do nothing),
 * the Input sources / scanner chooser, and the Barcode Scanning Test panel (it needs v2's scan-trace analysis).
 */
import { useState } from 'react';
import { Input } from '../ui/input';
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

export function BarcodeScanningSettings({ values, onChange, className }: BarcodeScanningSettingsProps) {
  return (
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
  );
}
