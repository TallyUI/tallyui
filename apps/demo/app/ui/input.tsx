import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Input, Label, Text, VStack, Icon } from '@tallyui/components';

export default function InputScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Input' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Input</Text>
          <Input>
            <Input.Field placeholder="Enter text" />
          </Input>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Label</Text>
          <VStack className="gap-1.5">
            <Label nativeID="demo-email">Email address</Label>
            <Input>
              <Input.Field
                placeholder="you@example.com"
                keyboardType="email-address"
                aria-labelledby="demo-email"
              />
            </Input>
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Left Icon</Text>
          <Input>
            <Input.Left className="mr-2">
              <Icon className="text-muted-foreground">
                <Text>Q</Text>
              </Icon>
            </Input.Left>
            <Input.Field placeholder="Search..." />
          </Input>
          <Input>
            <Input.Left className="mr-2">
              <Icon className="text-muted-foreground">
                <Text>@</Text>
              </Icon>
            </Input.Left>
            <Input.Field placeholder="Email" keyboardType="email-address" />
          </Input>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Right Icon</Text>
          <Input>
            <Input.Field placeholder="Search..." />
            <Input.Right className="ml-2">
              <Icon className="text-muted-foreground">
                <Text>X</Text>
              </Icon>
            </Input.Right>
          </Input>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Both Slots</Text>
          <Input>
            <Input.Left className="mr-2">
              <Icon className="text-muted-foreground">
                <Text>#</Text>
              </Icon>
            </Input.Left>
            <Input.Field placeholder="Password" secureTextEntry />
            <Input.Right className="ml-2">
              <Icon className="text-muted-foreground">
                <Text>o</Text>
              </Icon>
            </Input.Right>
          </Input>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <Input disabled>
            <Input.Field placeholder="Disabled input" />
          </Input>
          <Input disabled>
            <Input.Left className="mr-2">
              <Icon className="text-muted-foreground">
                <Text>Q</Text>
              </Icon>
            </Input.Left>
            <Input.Field placeholder="Disabled with icon" />
          </Input>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Keyboard Types</Text>
          <VStack className="gap-1.5">
            <Label nativeID="demo-number">Number</Label>
            <Input>
              <Input.Field
                placeholder="0"
                keyboardType="numeric"
                aria-labelledby="demo-number"
              />
            </Input>
          </VStack>
          <VStack className="gap-1.5">
            <Label nativeID="demo-phone">Phone</Label>
            <Input>
              <Input.Field
                placeholder="+1 (555) 000-0000"
                keyboardType="phone-pad"
                aria-labelledby="demo-phone"
              />
            </Input>
          </VStack>
        </VStack>
      </ScrollView>
    </>
  );
}
