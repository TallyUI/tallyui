import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Text, TextClassContext } from '@tallyui/components';

export default function TextScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Text' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        {/* Default variant */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Default Variant</Text>
          <Text>Base text with default styling</Text>
        </View>

        {/* Sizes */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <Text className="text-xs">Extra small (text-xs)</Text>
          <Text className="text-sm">Small (text-sm)</Text>
          <Text>Base (default)</Text>
          <Text className="text-lg">Large (text-lg)</Text>
          <Text className="text-xl">Extra large (text-xl)</Text>
          <Text className="text-2xl">2XL (text-2xl)</Text>
          <Text className="text-3xl">3XL (text-3xl)</Text>
        </View>

        {/* Font weights */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Font Weights</Text>
          <Text className="font-light">Light weight</Text>
          <Text className="font-normal">Normal weight</Text>
          <Text className="font-medium">Medium weight</Text>
          <Text className="font-semibold">Semibold weight</Text>
          <Text className="font-bold">Bold weight</Text>
          <Text className="font-extrabold">Extrabold weight</Text>
        </View>

        {/* Link variant */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Link Variant</Text>
          <Text variant="link">Tappable link text</Text>
          <Text variant="link" className="text-primary">Colored link text</Text>
        </View>

        {/* Colors */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Colors</Text>
          <Text>Foreground (default)</Text>
          <Text className="text-primary">Primary</Text>
          <Text className="text-secondary-foreground">Secondary foreground</Text>
          <Text className="text-muted-foreground">Muted foreground</Text>
          <Text className="text-destructive">Destructive</Text>
        </View>

        {/* TextClassContext */}
        <View className="gap-3">
          <Text className="text-lg font-bold">TextClassContext</Text>
          <Text className="text-sm text-muted-foreground">
            Parent components can cascade text styles via context.
          </Text>
          <View className="gap-2 rounded-lg border border-border p-3">
            <TextClassContext.Provider value="text-sm text-muted-foreground italic">
              <Text>Inherits context: small, muted, italic</Text>
              <Text className="text-primary not-italic">Override: primary color, no italic</Text>
            </TextClassContext.Provider>
          </View>
        </View>

        {/* Alignment */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Alignment</Text>
          <Text className="text-left">Left aligned (default)</Text>
          <Text className="text-center">Center aligned</Text>
          <Text className="text-right">Right aligned</Text>
        </View>

        {/* Number of lines */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Truncation</Text>
          <Text numberOfLines={1}>
            This is a long piece of text that should be truncated to a single line with an ellipsis
            at the end so it does not overflow the container bounds.
          </Text>
          <Text numberOfLines={2}>
            This text is limited to two lines. It contains enough content to demonstrate how
            multi-line truncation works when the text exceeds the available space in the layout
            container. The overflow will be handled with an ellipsis.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}
