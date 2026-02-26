import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Icon, Text, TextClassContext } from '@tallyui/components';

/**
 * Placeholder icon — a simple filled circle rendered as a View.
 * Replace with a real SVG icon component in production.
 */
function DotIcon() {
  return <View className="h-full w-full rounded-full bg-current" />;
}

export default function IconScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Icon' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        {/* Sizes */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <View className="flex-row items-end gap-4">
            <View className="items-center gap-1">
              <Icon size="xs"><DotIcon /></Icon>
              <Text className="text-xs text-muted-foreground">xs</Text>
            </View>
            <View className="items-center gap-1">
              <Icon size="sm"><DotIcon /></Icon>
              <Text className="text-xs text-muted-foreground">sm</Text>
            </View>
            <View className="items-center gap-1">
              <Icon size="md"><DotIcon /></Icon>
              <Text className="text-xs text-muted-foreground">md</Text>
            </View>
            <View className="items-center gap-1">
              <Icon size="lg"><DotIcon /></Icon>
              <Text className="text-xs text-muted-foreground">lg</Text>
            </View>
            <View className="items-center gap-1">
              <Icon size="xl"><DotIcon /></Icon>
              <Text className="text-xs text-muted-foreground">xl</Text>
            </View>
          </View>
        </View>

        {/* Custom colors */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Colors</Text>
          <View className="flex-row items-center gap-4">
            <Icon className="text-primary"><DotIcon /></Icon>
            <Icon className="text-destructive"><DotIcon /></Icon>
            <Icon className="text-green-600"><DotIcon /></Icon>
            <Icon className="text-blue-500"><DotIcon /></Icon>
            <Icon className="text-orange-500"><DotIcon /></Icon>
          </View>
        </View>

        {/* TextClassContext inheritance */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Color Inheritance</Text>
          <Text className="text-sm text-muted-foreground">
            Icons inherit color from TextClassContext, so they match surrounding text automatically.
          </Text>

          <View className="gap-3">
            <TextClassContext.Provider value="text-primary">
              <View className="flex-row items-center gap-2">
                <Icon size="sm"><DotIcon /></Icon>
                <Text>Primary context</Text>
              </View>
            </TextClassContext.Provider>

            <TextClassContext.Provider value="text-destructive">
              <View className="flex-row items-center gap-2">
                <Icon size="sm"><DotIcon /></Icon>
                <Text>Destructive context</Text>
              </View>
            </TextClassContext.Provider>

            <TextClassContext.Provider value="text-muted-foreground">
              <View className="flex-row items-center gap-2">
                <Icon size="sm"><DotIcon /></Icon>
                <Text>Muted context</Text>
              </View>
            </TextClassContext.Provider>
          </View>
        </View>

        {/* className override */}
        <View className="gap-3">
          <Text className="text-lg font-bold">className Override</Text>
          <Text className="text-sm text-muted-foreground">
            Even inside a colored context, className on Icon takes priority.
          </Text>
          <TextClassContext.Provider value="text-destructive">
            <View className="flex-row items-center gap-3">
              <Icon size="lg"><DotIcon /></Icon>
              <Icon size="lg" className="text-blue-500"><DotIcon /></Icon>
              <Text className="text-sm">Left inherits red, right overrides to blue</Text>
            </View>
          </TextClassContext.Provider>
        </View>
      </ScrollView>
    </>
  );
}
