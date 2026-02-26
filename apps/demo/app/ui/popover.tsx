import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  Popover, PopoverTrigger, PopoverContent,
  Button, Text, VStack, HStack, Input, Label,
} from '@tallyui/components';

export default function PopoverScreen() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Popover' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Popover</Text>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline"><Text>Open Popover</Text></Button>
            </PopoverTrigger>
            <PopoverContent>
              <VStack className="gap-2">
                <Text className="text-sm font-medium">Popover Content</Text>
                <Text className="text-sm text-muted-foreground">
                  This is a basic popover with some content inside.
                </Text>
              </VStack>
            </PopoverContent>
          </Popover>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Settings Popover</Text>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline"><Text>Dimensions</Text></Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <VStack className="gap-4">
                <VStack className="gap-1">
                  <Text className="text-sm font-medium">Dimensions</Text>
                  <Text className="text-xs text-muted-foreground">
                    Set the dimensions for the layer.
                  </Text>
                </VStack>
                <VStack className="gap-2">
                  <HStack className="items-center gap-4">
                    <Label className="w-16">Width</Label>
                    <Input className="flex-1">
                      <Input.Field defaultValue="100%" />
                    </Input>
                  </HStack>
                  <HStack className="items-center gap-4">
                    <Label className="w-16">Height</Label>
                    <Input className="flex-1">
                      <Input.Field defaultValue="auto" />
                    </Input>
                  </HStack>
                </VStack>
              </VStack>
            </PopoverContent>
          </Popover>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Controlled Popover</Text>
          <Text className="text-sm text-muted-foreground">
            State: {open ? 'OPEN' : 'CLOSED'}
          </Text>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary"><Text>Toggle Popover</Text></Button>
            </PopoverTrigger>
            <PopoverContent>
              <VStack className="gap-2">
                <Text className="text-sm font-medium">Controlled</Text>
                <Text className="text-sm text-muted-foreground">
                  This popover is controlled. Open: {open ? 'true' : 'false'}
                </Text>
                <Button size="sm" variant="outline" onPress={() => setOpen(false)}>
                  <Text>Close</Text>
                </Button>
              </VStack>
            </PopoverContent>
          </Popover>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
