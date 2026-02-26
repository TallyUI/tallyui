import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { VStack, Text } from '@tallyui/components';

function ColorBox({ label, color }: { label: string; color: string }) {
  return (
    <View className={`${color} items-center justify-center rounded px-3 py-2`}>
      <Text className="text-sm font-medium text-white">{label}</Text>
    </View>
  );
}

export default function VStackScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'VStack' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        {/* Default */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Default (space md)</Text>
          <VStack>
            <ColorBox label="A" color="bg-primary" />
            <ColorBox label="B" color="bg-primary" />
            <ColorBox label="C" color="bg-primary" />
          </VStack>
        </View>

        {/* Spacing scale */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Spacing Scale</Text>

          <View className="flex-row flex-wrap gap-4">
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">none</Text>
              <VStack space="none">
                <ColorBox label="A" color="bg-blue-500" />
                <ColorBox label="B" color="bg-blue-500" />
                <ColorBox label="C" color="bg-blue-500" />
              </VStack>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">xs</Text>
              <VStack space="xs">
                <ColorBox label="A" color="bg-blue-500" />
                <ColorBox label="B" color="bg-blue-500" />
                <ColorBox label="C" color="bg-blue-500" />
              </VStack>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">sm</Text>
              <VStack space="sm">
                <ColorBox label="A" color="bg-blue-500" />
                <ColorBox label="B" color="bg-blue-500" />
                <ColorBox label="C" color="bg-blue-500" />
              </VStack>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">md</Text>
              <VStack space="md">
                <ColorBox label="A" color="bg-blue-500" />
                <ColorBox label="B" color="bg-blue-500" />
                <ColorBox label="C" color="bg-blue-500" />
              </VStack>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">lg</Text>
              <VStack space="lg">
                <ColorBox label="A" color="bg-blue-500" />
                <ColorBox label="B" color="bg-blue-500" />
                <ColorBox label="C" color="bg-blue-500" />
              </VStack>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">xl</Text>
              <VStack space="xl">
                <ColorBox label="A" color="bg-blue-500" />
                <ColorBox label="B" color="bg-blue-500" />
                <ColorBox label="C" color="bg-blue-500" />
              </VStack>
            </View>
          </View>
        </View>

        {/* Reversed */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Reversed</Text>
          <VStack reversed>
            <ColorBox label="1" color="bg-green-600" />
            <ColorBox label="2" color="bg-green-500" />
            <ColorBox label="3" color="bg-green-400" />
          </VStack>
          <Text className="text-sm text-muted-foreground">
            Items are ordered 1, 2, 3 in markup but render bottom-to-top.
          </Text>
        </View>

        {/* Alignment with className */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Alignment</Text>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">items-start (default)</Text>
            <VStack className="items-start">
              <ColorBox label="Short" color="bg-violet-500" />
              <ColorBox label="Medium text" color="bg-violet-500" />
              <ColorBox label="A" color="bg-violet-500" />
            </VStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">items-center</Text>
            <VStack className="items-center">
              <ColorBox label="Short" color="bg-violet-500" />
              <ColorBox label="Medium text" color="bg-violet-500" />
              <ColorBox label="A" color="bg-violet-500" />
            </VStack>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">items-stretch</Text>
            <VStack className="items-stretch">
              <ColorBox label="Short" color="bg-violet-500" />
              <ColorBox label="Medium text" color="bg-violet-500" />
              <ColorBox label="A" color="bg-violet-500" />
            </VStack>
          </View>
        </View>

        {/* Practical: Form layout */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Form Layout Example</Text>
          <VStack space="lg" className="rounded-lg border border-border p-4">
            <VStack space="xs">
              <Text className="text-sm font-medium">Name</Text>
              <View className="rounded-md border border-input bg-background px-3 py-2">
                <Text className="text-muted-foreground">Enter your name</Text>
              </View>
            </VStack>
            <VStack space="xs">
              <Text className="text-sm font-medium">Email</Text>
              <View className="rounded-md border border-input bg-background px-3 py-2">
                <Text className="text-muted-foreground">you@example.com</Text>
              </View>
            </VStack>
            <VStack space="xs">
              <Text className="text-sm font-medium">Message</Text>
              <View className="h-20 rounded-md border border-input bg-background px-3 py-2">
                <Text className="text-muted-foreground">Write something...</Text>
              </View>
            </VStack>
          </VStack>
        </View>
      </ScrollView>
    </>
  );
}
