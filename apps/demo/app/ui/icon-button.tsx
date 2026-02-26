import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { IconButton, Text, VStack, HStack, Icon } from '@tallyui/components';

export default function IconButtonScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'IconButton' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Variants</Text>
          <HStack className="gap-2">
            <IconButton variant="default">
              <Icon>
                <Text>S</Text>
              </Icon>
            </IconButton>
            <IconButton variant="destructive">
              <Icon>
                <Text>X</Text>
              </Icon>
            </IconButton>
            <IconButton variant="outline">
              <Icon>
                <Text>...</Text>
              </Icon>
            </IconButton>
            <IconButton variant="secondary">
              <Icon>
                <Text>+</Text>
              </Icon>
            </IconButton>
            <IconButton variant="ghost">
              <Icon>
                <Text>S</Text>
              </Icon>
            </IconButton>
          </HStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <HStack className="items-center gap-2">
            <IconButton size="sm">
              <Icon size="sm">
                <Text>S</Text>
              </Icon>
            </IconButton>
            <IconButton size="md">
              <Icon>
                <Text>S</Text>
              </Icon>
            </IconButton>
            <IconButton size="lg">
              <Icon size="lg">
                <Text>S</Text>
              </Icon>
            </IconButton>
          </HStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Toolbar Example</Text>
          <HStack className="gap-1">
            <IconButton>
              <Icon>
                <Text>B</Text>
              </Icon>
            </IconButton>
            <IconButton>
              <Icon>
                <Text>I</Text>
              </Icon>
            </IconButton>
            <IconButton>
              <Icon>
                <Text>U</Text>
              </Icon>
            </IconButton>
          </HStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <HStack className="gap-2">
            <IconButton disabled>
              <Icon>
                <Text>S</Text>
              </Icon>
            </IconButton>
            <IconButton variant="destructive" disabled>
              <Icon>
                <Text>X</Text>
              </Icon>
            </IconButton>
            <IconButton variant="outline" disabled>
              <Icon>
                <Text>...</Text>
              </Icon>
            </IconButton>
          </HStack>
        </VStack>
      </ScrollView>
    </>
  );
}
