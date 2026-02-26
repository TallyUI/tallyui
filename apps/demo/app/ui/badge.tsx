import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Badge, Text } from '@tallyui/components';

export default function BadgeScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Badge' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        {/* All variants */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Variants</Text>
          <View className="flex-row flex-wrap gap-2">
            <Badge label="Default" />
            <Badge variant="secondary" label="Secondary" />
            <Badge variant="destructive" label="Destructive" />
            <Badge variant="outline" label="Outline" />
            <Badge variant="success" label="Success" />
            <Badge variant="warning" label="Warning" />
            <Badge variant="info" label="Info" />
          </View>
        </View>

        {/* Practical examples */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Practical Examples</Text>

          <View className="flex-row items-center gap-2">
            <Text>Orders</Text>
            <Badge label="12" />
          </View>

          <View className="flex-row items-center gap-2">
            <Text>Status</Text>
            <Badge variant="success" label="Active" />
          </View>

          <View className="flex-row items-center gap-2">
            <Text>Stock</Text>
            <Badge variant="warning" label="Low" />
          </View>

          <View className="flex-row items-center gap-2">
            <Text>Payment</Text>
            <Badge variant="destructive" label="Failed" />
          </View>

          <View className="flex-row items-center gap-2">
            <Text>Version</Text>
            <Badge variant="outline" label="v2.1.0" />
          </View>

          <View className="flex-row items-center gap-2">
            <Text>Update</Text>
            <Badge variant="info" label="New" />
          </View>
        </View>

        {/* Inside a list */}
        <View className="gap-3">
          <Text className="text-lg font-bold">In a List</Text>
          {[
            { name: 'Widget Pro', status: 'success', label: 'In Stock' },
            { name: 'Gadget Mini', status: 'warning', label: 'Low Stock' },
            { name: 'Super Gizmo', status: 'destructive', label: 'Out of Stock' },
            { name: 'Beta Feature', status: 'info', label: 'Coming Soon' },
          ].map((item) => (
            <View
              key={item.name}
              className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <Text>{item.name}</Text>
              <Badge
                variant={item.status as 'success' | 'warning' | 'destructive' | 'info'}
                label={item.label}
              />
            </View>
          ))}
        </View>

        {/* Custom children */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Children</Text>
          <Text className="text-sm text-muted-foreground">
            Instead of the label prop, you can pass custom children for full control.
          </Text>
          <View className="flex-row gap-2">
            <Badge variant="success">
              <Text className="text-xs font-semibold text-success-foreground">Custom</Text>
            </Badge>
            <Badge variant="outline">
              <Text className="text-xs font-semibold text-foreground">Styled</Text>
            </Badge>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
