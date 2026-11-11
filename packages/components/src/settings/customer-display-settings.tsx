/**
 * Settings › Customer display (ADR-085 U5, d4, d5, d11, d13): the till's paired displays, pairing one with a code and
 * its "wants to pair" check (#705), and forgetting one. Props only; the app passes `useTillPairing(pairing)` and
 * `useTillDisplays(service)` and wires the callbacks to the same `TillPairing`.
 */
import { useRef, type JSX } from 'react';
import { View } from 'react-native';
import type { PairingError, PairingPhase, TillDisplayEntry, TillDisplayStatus } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogTitle, AlertDialogTrigger,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Loader } from '../ui/loader';
import { Text } from '../ui/text';
import { SettingsGroup } from './settings-group';

export interface CustomerDisplaySettingsProps {
  /** `useTillPairing(pairing)`. */
  pairing: { phase: PairingPhase; forgetError: PairingError | null };
  /** `useTillDisplays(service)`. */
  displays: { status: TillDisplayStatus; displays: readonly TillDisplayEntry[] };
  onStartPairing: () => void;
  onConfirm: (claimId: string) => void;
  onDecline: (claimId: string) => void;
  onCancelPairing: () => void;
  onForget: (displayId: string) => void;
  /** Formats the code's expiry; default: the device's locale, hours and minutes. */
  formatTime?: (iso: string) => string;
  className?: string;
}

const PAIRING_ERRORS: Record<PairingError, string> = {
  forbidden: 'Sign in as a cashier who can pair customer displays.',
  limit: 'Too many pairing attempts. Try again in a few minutes.',
  expired: 'The code expired. Start again for a new code.',
  not_found: 'That display is no longer waiting. Ask it to enter the code again.',
  network: "Can't reach the store. Check the connection and try again.",
  server: "The store couldn't finish that. Try again.",
};

const STATUS_LINES: Partial<Record<TillDisplayStatus, string>> = {
  offline: "Can't reach the store. Open displays keep showing the sale; new connections wait.",
  paused: 'Sign in as a cashier who can pair customer displays.',
};

type CodePhase = Extract<PairingPhase, { phase: 'code' }>;

const defaultFormatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function stateOf({ display, link }: TillDisplayEntry): string {
  if (link === 'open') return 'Connected';
  if (link === 'connecting') return 'Connecting…';
  return display.connected ? 'Waiting for the display' : 'Offline';
}

function DisplayRow({ entry, onForget }: { entry: TillDisplayEntry; onForget: (displayId: string) => void }): JSX.Element {
  const { displayId, name } = entry.display;
  return (
    <View testID={`display-${displayId}`} className="flex-row items-center gap-3 px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{name}</Text>
        <Text testID={`display-state-${displayId}`} className="text-xs text-muted-foreground">{stateOf(entry)}</Text>
      </View>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button testID={`forget-${displayId}`} variant="outline" className="min-h-11"><Text>Forget</Text></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>{`Forget ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>It will need a new code to pair again.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button testID={`forget-cancel-${displayId}`} variant="outline" className="min-h-11"><Text>Cancel</Text></Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button testID={`forget-confirm-${displayId}`} variant="destructive" className="min-h-11" onPress={() => onForget(displayId)}>
                <Text>Forget</Text>
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}

export function CustomerDisplaySettings({
  pairing, displays, onStartPairing, onConfirm, onDecline, onCancelPairing, onForget, formatTime = defaultFormatTime, className,
}: CustomerDisplaySettingsProps): JSX.Element {
  const { phase, forgetError } = pairing;
  // `confirming` carries only the claim id, so the code and its claims stay on screen from the last `code` phase.
  const lastCode = useRef<CodePhase | null>(null);
  if (phase.phase === 'code') lastCode.current = phase;
  else if (phase.phase !== 'confirming') lastCode.current = null;
  const shown = phase.phase === 'code' ? phase : phase.phase === 'confirming' ? lastCode.current : null;
  const busy = phase.phase === 'confirming';
  const statusLine = STATUS_LINES[displays.status];

  return (
    <View className={cn('gap-6', className)}>
      {statusLine && <Text testID="customer-display-status" className="px-4 text-sm text-muted-foreground">{statusLine}</Text>}

      <SettingsGroup title="Paired displays">
        {displays.displays.length === 0
          ? <Text className="px-4 py-3 text-sm text-muted-foreground">No displays paired yet.</Text>
          : displays.displays.map((entry) => <DisplayRow key={entry.display.displayId} entry={entry} onForget={onForget} />)}
        {forgetError && (
          <Text testID="forget-error" className="px-4 py-3 text-sm text-destructive">{PAIRING_ERRORS[forgetError]}</Text>
        )}
      </SettingsGroup>

      <SettingsGroup title="Pair a display">
        {shown ? (
          <View className="gap-4 p-4">
            <View className="items-center gap-1">
              <Text testID="pairing-code" className="text-4xl font-bold tabular-nums text-foreground">{shown.code}</Text>
              <Text className="text-center text-sm text-muted-foreground">
                {`Enter this code on the display. Expires at ${formatTime(shown.expiresAt)}.`}
              </Text>
            </View>
            {shown.claims.length === 0 ? (
              <Text className="text-center text-sm text-muted-foreground">Waiting for a display…</Text>
            ) : (
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">Confirm only if the display shows the same check code.</Text>
                {shown.claims.map(({ claimId, displayName, checkCode }) => (
                  <View key={claimId} testID={`claim-${claimId}`} className="gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center">
                    <View className="flex-1 gap-1">
                      <Text className="text-sm text-foreground">{`${displayName} wants to pair. Check code`}</Text>
                      <Text testID={`check-${claimId}`} className="text-3xl font-bold tabular-nums text-foreground">{checkCode}</Text>
                    </View>
                    <View className="flex-row gap-2">
                      <Button testID={`decline-${claimId}`} variant="outline" className="min-h-11" disabled={busy} onPress={() => onDecline(claimId)}>
                        <Text>Decline</Text>
                      </Button>
                      <Button testID={`confirm-${claimId}`} className="min-h-11" disabled={busy} onPress={() => onConfirm(claimId)}>
                        {phase.phase === 'confirming' && phase.claimId === claimId ?<Loader size="sm" /> : null}
                        <Text>Confirm</Text>
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <Button testID="pairing-cancel" variant="outline" className="min-h-11" onPress={onCancelPairing}><Text>Cancel</Text></Button>
          </View>
        ) : (
          <View className="gap-3 p-4">
            {phase.phase === 'idle' && phase.error && (
              <Text testID="pairing-error" className="text-sm text-destructive">{PAIRING_ERRORS[phase.error]}</Text>
            )}
            <Button testID="pairing-start" className="min-h-11" disabled={phase.phase !== 'idle'} onPress={onStartPairing}>
              {phase.phase === 'idle' ? null : <Loader size="sm" />}
              <Text>Pair a display</Text>
            </Button>
          </View>
        )}
      </SettingsGroup>
    </View>
  );
}
