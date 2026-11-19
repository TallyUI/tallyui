import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Avatar, ChevronRightIcon, ListRow, Text } from '@tallyui/components';

const onPress = () => {};
const chevron = <ChevronRightIcon className="text-muted-foreground" />;

function person(name: string, line: string) {
  return (
    <>
      <Text numberOfLines={1}>{name}</Text>
      <Text numberOfLines={1} className="text-sm text-muted-foreground">{line}</Text>
    </>
  );
}

export default function ListRowScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'ListRow' }} />
      <ScrollView testID="list-row-screen" className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Default</Text>
          <View className="bg-card w-80">
            <ListRow
              leading={<Avatar fallback="AL" size="md" />}
              trailing={chevron}
              bodyClassName="gap-1"
              onPress={onPress}
              testID="list-row-1"
            >
              {person('Ada Lovelace', 'ada@example.com')}
            </ListRow>
            <ListRow
              leading={<Avatar fallback="GH" size="md" />}
              trailing={
                <>
                  <Text className="tabular-nums">18,00 €</Text>
                  {chevron}
                </>
              }
              bodyClassName="gap-1"
              onPress={onPress}
              testID="list-row-2"
            >
              {person('Grace Hopper', 'grace@example.com')}
            </ListRow>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Selected</Text>
          <View className="bg-card w-80">
            <ListRow selected bodyClassName="gap-1" onPress={onPress} testID="list-row-on">
              {person('Order 1042', 'Coffee ×2, Croissant')}
            </ListRow>
            <ListRow selected={false} bodyClassName="gap-1" onPress={onPress} testID="list-row-off">
              {person('Order 1043', 'Tea')}
            </ListRow>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Small</Text>
          <View className="bg-card w-80">
            <ListRow size="sm" trailing={chevron} onPress={onPress} testID="list-row-sm">
              <Text numberOfLines={1}>Last closure</Text>
            </ListRow>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Read-only</Text>
          <View className="bg-card w-80">
            <ListRow testID="list-row-static">
              <Text numberOfLines={1}>Last closure</Text>
            </ListRow>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <View className="bg-card w-80">
            <ListRow disabled onPress={onPress} testID="list-row-disabled">
              <Text numberOfLines={1}>No brands yet</Text>
            </ListRow>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
