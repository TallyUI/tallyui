import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, ConnectivityToast, Text } from '@tallyui/components';
import type { ConnectivityState } from '@tallyui/core';

export default function ConnectivityToastScreen() {
  const [state, setState] = useState<ConnectivityState>('online');
  return (
    <View className="flex-1 bg-background p-4 gap-2" testID="connectivity-toast-screen">
      <Stack.Screen options={{ title: 'ConnectivityToast' }} />
      <Text testID="connectivity-state">state={state}</Text>
      <Button testID="go-online" onPress={() => setState('online')}><Text>Online</Text></Button>
      <Button testID="go-offline" onPress={() => setState('offline')}><Text>Offline</Text></Button>
      <Button testID="go-degraded" onPress={() => setState('degraded')}><Text>Website unreachable</Text></Button>
      <ConnectivityToast state={state} />
    </View>
  );
}
