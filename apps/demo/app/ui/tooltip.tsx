import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  Tooltip, TooltipTrigger, TooltipContent,
  Button, Text, VStack, HStack, Icon,
} from '@tallyui/components';
import { Plus, Settings, Trash2, Info } from 'lucide-react-native';

export default function TooltipScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tooltip' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Tooltip</Text>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline"><Text>Hover me</Text></Button>
            </TooltipTrigger>
            <TooltipContent>
              <Text>This is a tooltip</Text>
            </TooltipContent>
          </Tooltip>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Icon Button Tooltips</Text>
          <HStack className="gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">
                  <Icon><Plus /></Icon>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Text>Add item</Text>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">
                  <Icon><Settings /></Icon>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Text>Settings</Text>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">
                  <Icon><Trash2 /></Icon>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Text>Delete</Text>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">
                  <Icon><Info /></Icon>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Text>More info</Text>
              </TooltipContent>
            </Tooltip>
          </HStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Positions</Text>
          <HStack className="gap-2 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline"><Text>Top</Text></Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <Text>Top tooltip</Text>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline"><Text>Bottom</Text></Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <Text>Bottom tooltip</Text>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline"><Text>Left</Text></Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <Text>Left tooltip</Text>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline"><Text>Right</Text></Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <Text>Right tooltip</Text>
              </TooltipContent>
            </Tooltip>
          </HStack>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
