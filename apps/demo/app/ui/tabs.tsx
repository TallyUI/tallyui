import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Text,
  VStack,
} from '@tallyui/components';

export default function TabsScreen() {
  const [controlledTab, setControlledTab] = useState('account');

  return (
    <>
      <Stack.Screen options={{ title: 'Tabs' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Uncontrolled</Text>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">
                <Text>Overview</Text>
              </TabsTrigger>
              <TabsTrigger value="analytics">
                <Text>Analytics</Text>
              </TabsTrigger>
              <TabsTrigger value="reports">
                <Text>Reports</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                  <CardDescription>Your store at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Text>Dashboard widgets would appear here.</Text>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="analytics">
              <Card>
                <CardHeader>
                  <CardTitle>Analytics</CardTitle>
                  <CardDescription>Detailed performance data.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Text>Charts and graphs would appear here.</Text>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="reports">
              <Card>
                <CardHeader>
                  <CardTitle>Reports</CardTitle>
                  <CardDescription>Export and review data.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Text>Report tools would appear here.</Text>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Controlled</Text>
          <Text className="text-sm text-muted-foreground">
            Active tab: {controlledTab}
          </Text>
          <Tabs value={controlledTab} onValueChange={setControlledTab}>
            <TabsList>
              <TabsTrigger value="account">
                <Text>Account</Text>
              </TabsTrigger>
              <TabsTrigger value="billing">
                <Text>Billing</Text>
              </TabsTrigger>
              <TabsTrigger value="team">
                <Text>Team</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="account">
              <Card>
                <CardContent className="pt-6">
                  <Text>Manage your account settings and profile information.</Text>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="billing">
              <Card>
                <CardContent className="pt-6">
                  <Text>View invoices and update payment methods.</Text>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="team">
              <Card>
                <CardContent className="pt-6">
                  <Text>Invite members and manage roles.</Text>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Two Tabs</Text>
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">
                <Text>Preview</Text>
              </TabsTrigger>
              <TabsTrigger value="code">
                <Text>Code</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <Card>
                <CardContent className="pt-6">
                  <Text>Visual preview of the component.</Text>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="code">
              <Card>
                <CardContent className="pt-6">
                  <Text className="font-mono text-sm">
                    {'<Button><Text>Click me</Text></Button>'}
                  </Text>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </VStack>
      </ScrollView>
    </>
  );
}
