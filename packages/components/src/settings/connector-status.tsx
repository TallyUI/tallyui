import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export type ConnectionStatus = 'connected' | 'disconnected' | 'syncing' | 'error';

export interface ConnectorStatusProps extends Omit<ViewProps, 'children'> {
  name: string;
  status: ConnectionStatus;
  lastSync?: string;
  error?: string;
  className?: string;
  /** Products the sales channel doesn't sell (the calculated-price runner's `unreported`). Hidden when undefined or 0. */
  unsoldCount?: number;
  /** True when that count is from an older pass than the last failure (`!isFingerprintResultCurrent(state)`). */
  unsoldStale?: boolean;
  /** The line's text; default: `${n} product(s) not sold in this channel`, plus ` (last check failed)` when stale. */
  formatUnsold?: (count: number, stale: boolean) => string;
}

// App wiring:
// const s = useObservable(runner.state$);
// <ConnectorStatus … unsoldCount={s.lastResult?.unreported} unsoldStale={!isFingerprintResultCurrent(s)} />

function defaultFormatUnsold(count: number, stale: boolean): string {
  return `${count} ${count === 1 ? 'product' : 'products'} not sold in this channel${stale ? ' (last check failed)' : ''}`;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  connected: { label: 'Connected', dot: 'bg-success', text: 'text-success' },
  disconnected: { label: 'Disconnected', dot: 'bg-muted', text: 'text-muted-foreground' },
  syncing: { label: 'Syncing...', dot: 'bg-info', text: 'text-info' },
  error: { label: 'Error', dot: 'bg-destructive', text: 'text-destructive' },
};

export function ConnectorStatus({
  name,
  status,
  lastSync,
  error,
  className,
  unsoldCount,
  unsoldStale,
  formatUnsold = defaultFormatUnsold,
  ...viewProps
}: ConnectorStatusProps) {
  const config = STATUS_CONFIG[status];

  return (
    <View className={cn('gap-2 rounded-lg border border-border bg-card p-3', className)} {...viewProps}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">{name}</Text>
        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-2 rounded-full', config.dot)} />
          <Text className={cn('text-xs font-medium', config.text)}>{config.label}</Text>
        </View>
      </View>
      {lastSync && <Text className="text-xs text-muted-foreground">Last sync: {lastSync}</Text>}
      {error && <Text className="text-xs text-destructive">{error}</Text>}
      {!!unsoldCount && (
        <Text className={cn('text-xs', unsoldStale ? 'text-muted-foreground' : 'text-warning')}>{formatUnsold(unsoldCount, !!unsoldStale)}</Text>
      )}
    </View>
  );
}
