import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Avatar, Text } from '@tallyui/components';

export default function AvatarScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Avatar' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        {/* Sizes */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <View className="flex-row items-end gap-4">
            <View className="items-center gap-1">
              <Avatar size="sm" alt="Small" />
              <Text className="text-xs text-muted-foreground">sm</Text>
            </View>
            <View className="items-center gap-1">
              <Avatar size="md" alt="Medium" />
              <Text className="text-xs text-muted-foreground">md</Text>
            </View>
            <View className="items-center gap-1">
              <Avatar size="lg" alt="Large" />
              <Text className="text-xs text-muted-foreground">lg</Text>
            </View>
            <View className="items-center gap-1">
              <Avatar size="xl" alt="XL" />
              <Text className="text-xs text-muted-foreground">xl</Text>
            </View>
          </View>
        </View>

        {/* With images */}
        <View className="gap-3">
          <Text className="text-lg font-bold">With Images</Text>
          <View className="flex-row items-center gap-4">
            <Avatar
              size="lg"
              src="https://i.pravatar.cc/150?u=alice"
              alt="Alice"
            />
            <Avatar
              size="lg"
              src="https://i.pravatar.cc/150?u=bob"
              alt="Bob"
            />
            <Avatar
              size="lg"
              src="https://i.pravatar.cc/150?u=carol"
              alt="Carol"
            />
          </View>
        </View>

        {/* Fallback behavior */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Fallback Behavior</Text>
          <Text className="text-sm text-muted-foreground">
            Shows the fallback prop, then first letter of alt, then "?" as a last resort.
          </Text>
          <View className="flex-row items-center gap-4">
            <View className="items-center gap-1">
              <Avatar size="lg" fallback="JD" />
              <Text className="text-xs text-muted-foreground">fallback</Text>
            </View>
            <View className="items-center gap-1">
              <Avatar size="lg" alt="Alice" />
              <Text className="text-xs text-muted-foreground">alt initial</Text>
            </View>
            <View className="items-center gap-1">
              <Avatar size="lg" />
              <Text className="text-xs text-muted-foreground">none</Text>
            </View>
          </View>
        </View>

        {/* Broken image (fallback on error) */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Image Error Fallback</Text>
          <Text className="text-sm text-muted-foreground">
            When an image fails to load, the avatar falls back to text.
          </Text>
          <View className="flex-row items-center gap-4">
            <Avatar
              size="lg"
              src="https://invalid-url-that-will-fail.example/photo.jpg"
              alt="Error"
              fallback="E"
            />
            <Avatar
              size="lg"
              src="https://invalid-url-that-will-fail.example/photo.jpg"
              alt="Broken"
            />
          </View>
        </View>

        {/* In a list */}
        <View className="gap-3">
          <Text className="text-lg font-bold">User List</Text>
          {[
            { name: 'Alice Chen', src: 'https://i.pravatar.cc/150?u=alice-chen' },
            { name: 'Bob Smith', src: 'https://i.pravatar.cc/150?u=bob-smith' },
            { name: 'Carol Davis', fallback: 'CD' },
            { name: 'Dan Wilson', src: 'https://i.pravatar.cc/150?u=dan-wilson' },
          ].map((user) => (
            <View
              key={user.name}
              className="flex-row items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <Avatar
                size="sm"
                src={user.src}
                alt={user.name}
                fallback={'fallback' in user ? user.fallback : undefined}
              />
              <Text>{user.name}</Text>
            </View>
          ))}
        </View>

        {/* Custom className */}
        <View className="gap-3">
          <Text className="text-lg font-bold">Custom className</Text>
          <Text className="text-sm text-muted-foreground">
            Override border-radius or add borders via className.
          </Text>
          <View className="flex-row items-center gap-4">
            <Avatar size="lg" alt="Round" className="rounded-full" />
            <Avatar size="lg" alt="Square" className="rounded-lg" />
            <Avatar size="lg" alt="Border" className="border-2 border-primary" />
          </View>
        </View>
      </ScrollView>
    </>
  );
}
