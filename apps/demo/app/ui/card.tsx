import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Text,
  VStack,
  Button,
} from '@tallyui/components';

export default function CardScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Card' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Card</Text>
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Manage your account settings and preferences.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Text>Your account is in good standing.</Text>
            </CardContent>
            <CardFooter>
              <Button>
                <Text>Save Changes</Text>
              </Button>
            </CardFooter>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Content Only</Text>
          <Card>
            <CardContent className="pt-6">
              <Text>A minimal card with just content and no header or footer.</Text>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Notification Card</Text>
          <Card>
            <CardHeader>
              <CardTitle>New Message</CardTitle>
              <CardDescription>You have 3 unread messages.</CardDescription>
            </CardHeader>
            <CardContent>
              <Text>Check your inbox for the latest updates from your team.</Text>
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="ghost">
                <Text>Dismiss</Text>
              </Button>
              <Button>
                <Text>View All</Text>
              </Button>
            </CardFooter>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Stats Cards</Text>
          <View className="flex-row gap-3">
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardDescription>Revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <Text className="text-2xl font-bold">$12,450</Text>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardDescription>Orders</CardDescription>
              </CardHeader>
              <CardContent>
                <Text className="text-2xl font-bold">48</Text>
              </CardContent>
            </Card>
          </View>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Custom Styled</Text>
          <Card className="border-primary bg-primary/5">
            <CardHeader>
              <CardTitle className="text-primary">Pro Plan</CardTitle>
              <CardDescription>Unlock all features with our premium tier.</CardDescription>
            </CardHeader>
            <CardContent>
              <Text className="text-3xl font-bold">$29/mo</Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full">
                <Text>Upgrade Now</Text>
              </Button>
            </CardFooter>
          </Card>
        </VStack>
      </ScrollView>
    </>
  );
}
