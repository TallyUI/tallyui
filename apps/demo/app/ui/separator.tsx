import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  Separator,
  Text,
  VStack,
  HStack,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@tallyui/components';

export default function SeparatorScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Separator' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Horizontal</Text>
          <Card>
            <CardContent className="pt-6">
              <VStack className="gap-4">
                <Text>Section one content</Text>
                <Separator />
                <Text>Section two content</Text>
                <Separator />
                <Text>Section three content</Text>
              </VStack>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Vertical</Text>
          <Card>
            <CardContent className="pt-6">
              <HStack className="h-10 items-center gap-4">
                <Text>Left</Text>
                <Separator orientation="vertical" />
                <Text>Center</Text>
                <Separator orientation="vertical" />
                <Text>Right</Text>
              </HStack>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Inside a Card</Text>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6">
              <Text>Account details would appear here.</Text>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Custom Color</Text>
          <VStack className="gap-4">
            <Text>Default border color</Text>
            <Separator />
            <Text>Primary color</Text>
            <Separator className="bg-primary" />
            <Text>Destructive color</Text>
            <Separator className="bg-destructive" />
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Menu-style List</Text>
          <Card>
            <CardContent className="p-0">
              <View className="px-4 py-3">
                <Text>General Settings</Text>
              </View>
              <Separator />
              <View className="px-4 py-3">
                <Text>Notifications</Text>
              </View>
              <Separator />
              <View className="px-4 py-3">
                <Text>Privacy</Text>
              </View>
              <Separator />
              <View className="px-4 py-3">
                <Text>About</Text>
              </View>
            </CardContent>
          </Card>
        </VStack>
      </ScrollView>
    </>
  );
}
