import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Loader, Text, TextClassContext } from '@tallyui/components';

export default function LoaderScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Loader' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        {/* Sizes */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <View className="flex-row items-end gap-6">
            <View className="items-center gap-2">
              <Loader size="sm" />
              <Text className="text-xs text-muted-foreground">sm</Text>
            </View>
            <View className="items-center gap-2">
              <Loader size="md" />
              <Text className="text-xs text-muted-foreground">md</Text>
            </View>
            <View className="items-center gap-2">
              <Loader size="lg" />
              <Text className="text-xs text-muted-foreground">lg</Text>
            </View>
          </View>
        </View>

        {/* Custom colors */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Colors</Text>
          <View className="flex-row items-center gap-6">
            <Loader className="text-primary" />
            <Loader className="text-destructive" />
            <Loader className="text-green-600" />
            <Loader className="text-blue-500" />
            <Loader className="text-orange-500" />
          </View>
        </View>

        {/* Color inheritance */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Color Inheritance</Text>
          <Text className="text-sm text-muted-foreground">
            Loader picks up color from TextClassContext, matching the text of its parent component.
          </Text>

          <View className="gap-3">
            <TextClassContext.Provider value="text-primary">
              <View className="flex-row items-center gap-2">
                <Loader size="sm" />
                <Text>Primary context</Text>
              </View>
            </TextClassContext.Provider>

            <TextClassContext.Provider value="text-destructive">
              <View className="flex-row items-center gap-2">
                <Loader size="sm" />
                <Text>Destructive context</Text>
              </View>
            </TextClassContext.Provider>

            <TextClassContext.Provider value="text-muted-foreground">
              <View className="flex-row items-center gap-2">
                <Loader size="sm" />
                <Text>Muted context</Text>
              </View>
            </TextClassContext.Provider>
          </View>
        </View>

        {/* Inline with text */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Inline Usage</Text>
          <View className="flex-row items-center gap-2 rounded-lg border border-border p-3">
            <Loader size="sm" />
            <Text className="text-sm">Loading data...</Text>
          </View>
          <View className="flex-row items-center gap-2 rounded-lg border border-border p-3">
            <Loader size="sm" className="text-destructive" />
            <Text className="text-sm text-destructive">Deleting item...</Text>
          </View>
        </View>

        {/* On dark background */}
        <View className="gap-3">
          <Text className="text-lg font-bold">On Dark Background</Text>
          <View className="flex-row items-center justify-center gap-3 rounded-lg bg-primary p-4">
            <Loader size="md" className="text-primary-foreground" />
            <Text className="text-primary-foreground">Processing...</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
