import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { IconButton, Text, VStack, HStack, Icon } from '@tallyui/components';
import { Settings, Trash2, MoreHorizontal, Plus, Bold, Italic, Underline } from 'lucide-react-native';

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
                <Settings />
              </Icon>
            </IconButton>
            <IconButton variant="destructive">
              <Icon>
                <Trash2 />
              </Icon>
            </IconButton>
            <IconButton variant="outline">
              <Icon>
                <MoreHorizontal />
              </Icon>
            </IconButton>
            <IconButton variant="secondary">
              <Icon>
                <Plus />
              </Icon>
            </IconButton>
            <IconButton variant="ghost">
              <Icon>
                <Settings />
              </Icon>
            </IconButton>
          </HStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <HStack className="items-center gap-2">
            <IconButton size="sm">
              <Icon size="sm">
                <Settings />
              </Icon>
            </IconButton>
            <IconButton size="md">
              <Icon>
                <Settings />
              </Icon>
            </IconButton>
            <IconButton size="lg">
              <Icon size="lg">
                <Settings />
              </Icon>
            </IconButton>
          </HStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Toolbar Example</Text>
          <HStack className="gap-1">
            <IconButton>
              <Icon>
                <Bold />
              </Icon>
            </IconButton>
            <IconButton>
              <Icon>
                <Italic />
              </Icon>
            </IconButton>
            <IconButton>
              <Icon>
                <Underline />
              </Icon>
            </IconButton>
          </HStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <HStack className="gap-2">
            <IconButton disabled>
              <Icon>
                <Settings />
              </Icon>
            </IconButton>
            <IconButton variant="destructive" disabled>
              <Icon>
                <Trash2 />
              </Icon>
            </IconButton>
            <IconButton variant="outline" disabled>
              <Icon>
                <MoreHorizontal />
              </Icon>
            </IconButton>
          </HStack>
        </VStack>
      </ScrollView>
    </>
  );
}
