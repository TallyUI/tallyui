import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { ToggleGroup, ToggleGroupItem, Text, VStack, Icon } from '@tallyui/components';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline } from 'lucide-react-native';

export default function ToggleGroupScreen() {
  const [alignment, setAlignment] = useState('center');
  const [formats, setFormats] = useState<string[]>([]);

  return (
    <>
      <Stack.Screen options={{ title: 'ToggleGroup' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Single Selection</Text>
          <Text className="text-sm text-muted-foreground">
            Selected: {alignment || 'none'}
          </Text>
          <ToggleGroup type="single" value={alignment} onValueChange={setAlignment}>
            <ToggleGroupItem value="left">
              <Icon><AlignLeft /></Icon>
            </ToggleGroupItem>
            <ToggleGroupItem value="center">
              <Icon><AlignCenter /></Icon>
            </ToggleGroupItem>
            <ToggleGroupItem value="right">
              <Icon><AlignRight /></Icon>
            </ToggleGroupItem>
          </ToggleGroup>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Multiple Selection</Text>
          <Text className="text-sm text-muted-foreground">
            Selected: {formats.length > 0 ? formats.join(', ') : 'none'}
          </Text>
          <ToggleGroup type="multiple" value={formats} onValueChange={setFormats}>
            <ToggleGroupItem value="bold">
              <Icon><Bold /></Icon>
            </ToggleGroupItem>
            <ToggleGroupItem value="italic">
              <Icon><Italic /></Icon>
            </ToggleGroupItem>
            <ToggleGroupItem value="underline">
              <Icon><Underline /></Icon>
            </ToggleGroupItem>
          </ToggleGroup>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Outline Variant</Text>
          <ToggleGroup type="single" variant="outline" defaultValue="a">
            <ToggleGroupItem value="a"><Text>A</Text></ToggleGroupItem>
            <ToggleGroupItem value="b"><Text>B</Text></ToggleGroupItem>
            <ToggleGroupItem value="c"><Text>C</Text></ToggleGroupItem>
          </ToggleGroup>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <ToggleGroup type="single" size="sm" defaultValue="sm">
            <ToggleGroupItem value="sm"><Text>Small</Text></ToggleGroupItem>
            <ToggleGroupItem value="md"><Text>Med</Text></ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" size="default" defaultValue="default">
            <ToggleGroupItem value="default"><Text>Default</Text></ToggleGroupItem>
            <ToggleGroupItem value="other"><Text>Other</Text></ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" size="lg" defaultValue="lg">
            <ToggleGroupItem value="lg"><Text>Large</Text></ToggleGroupItem>
            <ToggleGroupItem value="xl"><Text>XL</Text></ToggleGroupItem>
          </ToggleGroup>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <ToggleGroup type="single" disabled defaultValue="x">
            <ToggleGroupItem value="x"><Text>X</Text></ToggleGroupItem>
            <ToggleGroupItem value="y"><Text>Y</Text></ToggleGroupItem>
            <ToggleGroupItem value="z"><Text>Z</Text></ToggleGroupItem>
          </ToggleGroup>
        </VStack>
      </ScrollView>
    </>
  );
}
