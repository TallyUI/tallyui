import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export type ConnectionStatus = 'connected' | 'disconnected' | 'syncing' | 'error';

export interface ConnectorStatusProps extends Omit<ViewProps, 'children'> {
  name: string;
  status: ConnectionStatus;
  lastSync?: string;
  error?: string;
  className?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  connected: { label: 'Connected', dot: 'bg-success', text: 'text-success' },
  disconnected: { label: 'Disconnected', dot: 'bg-muted', text: 'text-muted' },
  syncing: { label: 'Syncing...', dot: 'bg-info', text: 'text-info' },
  error: { label: 'Error', dot: 'bg-danger', text: 'text-danger' },
};

export function ConnectorStatus({
  name,
  status,
  lastSync,
  error,
  className,
  ...viewProps
}: ConnectorStatusProps) {
  const config = STATUS_CONFIG[status];

  return (
    <View className={cn('gap-2 rounded-lg border border-border bg-surface p-3', className)} {...viewProps}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">{name}</Text>
        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-2 rounded-full', config.dot)} />
          <Text className={cn('text-xs font-medium', config.text)}>{config.label}</Text>
        </View>
      </View>
      {lastSync && <Text className="text-xs text-muted">Last sync: {lastSync}</Text>}
      {error && <Text className="text-xs text-danger">{error}</Text>}
    </View>
  );
}
