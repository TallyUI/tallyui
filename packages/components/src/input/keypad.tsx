// Port of WCPOS v2 `packages/components/src/keypad/index.tsx` (monorepo main), MIT, WCPOS.
import { Pressable, Text, View } from 'react-native';
import { cn } from '@tallyui/theme';

export interface KeypadKey {
  /** What a press reports: a digit, `decimal`, `backspace`, or the caller's own key. */
  name: string;
  /** The accessible name: the digit, or the caller's own ("Delete last digit"). */
  label: string;
  /** The key's text when it is not its label (`⌫`, named "Delete last digit"). */
  text?: string;
  /** The cells the key takes in its row (default 1). */
  span?: number;
}

export interface KeypadProps {
  rows: readonly (readonly KeypadKey[])[];
  onPress: (name: string) => void;
  /** A key is `<testID>-key-<name>`. */
  testID?: string;
  className?: string;
}

/** v2's DIGIT_ROWS: 123 / 456 / 789; the caller adds its own last row. */
export const DIGIT_ROWS: KeypadKey[][] = ['123', '456', '789'].map((row) => [...row].map((digit) => ({ name: digit, label: digit })));

/** Rows of keys with no display or value, as v2's Keypad: the caller owns the entry. */
export function Keypad({ rows, onPress, testID, className }: KeypadProps) {
  return <View testID={testID} className={cn('gap-2', className)}>
    {rows.map((row, index) => <View key={index} className="flex-row gap-2">
      {row.map(({ name, label, text, span }) => <Pressable key={name} testID={testID && `${testID}-key-${name}`} accessibilityRole="button"
        accessibilityLabel={label} onPress={() => onPress(name)} style={{ flex: span ?? 1 }}
        className="min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 py-2">
        <Text className="text-xl font-semibold text-foreground">{text ?? label}</Text>
      </Pressable>)}
    </View>)}
  </View>;
}
