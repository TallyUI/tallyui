import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { ConnectorStatus, Text } from '@tallyui/components';

export default function ConnectorStatusScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'ConnectorStatus' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Connection States</Text>
          <ConnectorStatus
            name="WooCommerce"
            status="connected"
            lastSync="2 minutes ago"
          />
          <ConnectorStatus
            name="Medusa"
            status="syncing"
            lastSync="Syncing now..."
          />
          <ConnectorStatus
            name="Shopify"
            status="disconnected"
          />
          <ConnectorStatus
            name="Vendure"
            status="error"
            error="Connection timeout after 30s"
            lastSync="1 hour ago"
          />
        </View>
      </ScrollView>
    </>
  );
}
