import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { HStack, Text } from '@tallyui/components';

function ColorBox({ label, color }: { label: string; color: string }) {
  return (
    <View className={`${color} items-center justify-center rounded px-3 py-2`}>
      <Text className="text-sm font-medium text-white">{label}</Text>
    </View>
  );
}

export default function HStackScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'HStack' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        {/* Default */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Default (space md)</Text>
          <HStack>
            <ColorBox label="A" color="bg-primary" />
            <ColorBox label="B" color="bg-primary" />
            <ColorBox label="C" color="bg-primary" />
          </HStack>
        </View>

        {/* Spacing scale */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Spacing Scale</Text>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">none</Text>
            <HStack space="none">
              <ColorBox label="A" color="bg-blue-500" />
              <ColorBox label="B" color="bg-blue-500" />
              <ColorBox label="C" color="bg-blue-500" />
            </HStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">xs</Text>
            <HStack space="xs">
              <ColorBox label="A" color="bg-blue-500" />
              <ColorBox label="B" color="bg-blue-500" />
              <ColorBox label="C" color="bg-blue-500" />
            </HStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">sm</Text>
            <HStack space="sm">
              <ColorBox label="A" color="bg-blue-500" />
              <ColorBox label="B" color="bg-blue-500" />
              <ColorBox label="C" color="bg-blue-500" />
            </HStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">md (default)</Text>
            <HStack space="md">
              <ColorBox label="A" color="bg-blue-500" />
              <ColorBox label="B" color="bg-blue-500" />
              <ColorBox label="C" color="bg-blue-500" />
            </HStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">lg</Text>
            <HStack space="lg">
              <ColorBox label="A" color="bg-blue-500" />
              <ColorBox label="B" color="bg-blue-500" />
              <ColorBox label="C" color="bg-blue-500" />
            </HStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">xl</Text>
            <HStack space="xl">
              <ColorBox label="A" color="bg-blue-500" />
              <ColorBox label="B" color="bg-blue-500" />
              <ColorBox label="C" color="bg-blue-500" />
            </HStack>
          </View>
        </View>

        {/* Reversed */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Reversed</Text>
          <HStack reversed>
            <ColorBox label="1" color="bg-green-600" />
            <ColorBox label="2" color="bg-green-500" />
            <ColorBox label="3" color="bg-green-400" />
          </HStack>
          <Text className="text-sm text-muted-foreground">
            Items are ordered 1, 2, 3 in markup but render right-to-left.
          </Text>
        </View>

        {/* Alignment with className */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Justify Content</Text>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">justify-between</Text>
            <HStack className="justify-between">
              <ColorBox label="Left" color="bg-violet-500" />
              <ColorBox label="Right" color="bg-violet-500" />
            </HStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">justify-center</Text>
            <HStack className="justify-center">
              <ColorBox label="A" color="bg-violet-500" />
              <ColorBox label="B" color="bg-violet-500" />
            </HStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">justify-end</Text>
            <HStack className="justify-end">
              <ColorBox label="A" color="bg-violet-500" />
              <ColorBox label="B" color="bg-violet-500" />
            </HStack>
          </View>
        </View>

        {/* Wrapping */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Wrapping</Text>
          <HStack className="flex-wrap" space="sm">
            {Array.from({ length: 8 }, (_, i) => (
              <ColorBox key={i} label={`Tag ${i + 1}`} color="bg-orange-500" />
            ))}
          </HStack>
          <Text className="text-sm text-muted-foreground">
            Add flex-wrap via className to allow items to wrap to the next line.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}
