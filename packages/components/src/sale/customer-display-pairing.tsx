/**
 * The display device's screen (ADR-085 U5, d4, d8, #705): enter the till's code and a name, show the check code while
 * the cashier confirms, then the sale through `CustomerDisplayScreen`. Props only; the app passes
 * `useDisplayClient(client)` and wires `onClaim` and `onCancel` to the same `DisplayClient`.
 */
import { useState, type JSX } from 'react';
import { View } from 'react-native';
import type { DisplayClientError, DisplayClientPhase, DisplayState } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader } from '../ui/loader';
import { Text } from '../ui/text';
import { CustomerDisplayScreen } from './customer-display-screen';

export interface CustomerDisplayPairingProps {
  /** `useDisplayClient(client)`. */
  client: { phase: DisplayClientPhase; state: DisplayState };
  onClaim: (code: string, displayName: string) => void;
  onCancel: () => void;
  /** The name field's starting value, e.g. the last name used; default "Customer display". */
  defaultName?: string;
  className?: string;
}

const DISPLAY_ERRORS: Record<DisplayClientError, string> = {
  claim_refused: "That code didn't work. Check it on the till and try again.",
  collect_refused: 'The till declined, or the code expired. Enter a new code.',
  forgotten: 'This display was removed from its till. Enter a new code to pair it again.',
  network: "Can't reach the store. Check the connection and try again.",
  server: "The store couldn't finish that. Try again.",
};

/** Enter-code and claiming; it unmounts once the display waits or pairs, so a later enter-code starts with an empty code. */
function CodeForm({ claiming, error, defaultName, onClaim }: {
  claiming: boolean; error?: DisplayClientError; defaultName: string; onClaim: CustomerDisplayPairingProps['onClaim'];
}): JSX.Element {
  const [code, setCode] = useState('');
  const [name, setName] = useState(defaultName);
  const ready = code.trim() !== '' && name.trim() !== '';
  return (
    <View className="w-full max-w-md gap-4">
      <Text className="text-2xl font-semibold text-foreground">Pair with a till</Text>
      <View className="gap-1">
        <Text nativeID="display-code-label" className="text-sm font-medium text-foreground">Code</Text>
        <Input disabled={claiming} className="h-14">
          <Input.Field
            testID="display-code" accessibilityLabelledBy="display-code-label" value={code} onChangeText={setCode}
            keyboardType="number-pad" autoFocus className="text-2xl tabular-nums"
          />
        </Input>
      </View>
      <View className="gap-1">
        <Text nativeID="display-name-label" className="text-sm font-medium text-foreground">Display name</Text>
        <Input disabled={claiming} className="h-11">
          <Input.Field testID="display-name" accessibilityLabelledBy="display-name-label" value={name} onChangeText={setName} />
        </Input>
      </View>
      {error && <Text testID="pairing-error" className="text-sm text-destructive">{DISPLAY_ERRORS[error]}</Text>}
      <Button
        testID="display-pair" size="lg" disabled={claiming || !ready} onPress={() => onClaim(code.trim(), name.trim())}
      >
        {claiming ? <Loader size="sm" /> : null}
        <Text>Pair</Text>
      </Button>
      <Text className="text-sm text-muted-foreground">
        Ask the cashier for a code: Settings › Customer display › Pair a display on the till.
      </Text>
    </View>
  );
}

export function CustomerDisplayPairing({
  client, onClaim, onCancel, defaultName = 'Customer display', className,
}: CustomerDisplayPairingProps): JSX.Element {
  const { phase, state } = client;
  if (phase.phase === 'paired') {
    return (
      <View testID="display-paired" className={cn('relative flex-1', className)}>
        <CustomerDisplayScreen state={state} />
        {/* Inside the screen's own padding at the top corner, clear of the cart and the totals. */}
        {!phase.online && (
          <View testID="display-offline" style={{ pointerEvents: 'none' }} className="absolute right-2 top-2 rounded-md bg-muted px-2 py-1">
            <Text className="text-xs text-muted-foreground">Offline</Text>
          </View>
        )}
      </View>
    );
  }
  return (
    <View className={cn('flex-1 items-center justify-center bg-background p-6', className)}>
      {phase.phase === 'starting' ? <Loader testID="display-starting" size="lg" /> : null}
      {phase.phase === 'enter-code' || phase.phase === 'claiming' ? (
        <CodeForm
          claiming={phase.phase === 'claiming'} error={phase.phase === 'enter-code' ? phase.error : undefined}
          defaultName={defaultName} onClaim={onClaim}
        />
      ) : null}
      {phase.phase === 'waiting' ? (
        <View className="w-full max-w-md items-center gap-4">
          <Text className="text-lg font-medium text-foreground">Check code</Text>
          <Text testID="display-check-code" className="text-6xl font-bold tabular-nums text-foreground">{phase.checkCode}</Text>
          <Text className="text-center text-sm text-muted-foreground">
            Make sure the till shows the same code, then the cashier confirms.
          </Text>
          <Button testID="display-cancel" variant="outline" size="lg" onPress={onCancel}><Text>Cancel</Text></Button>
        </View>
      ) : null}
    </View>
  );
}
