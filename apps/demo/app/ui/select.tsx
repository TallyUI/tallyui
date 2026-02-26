import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectGroup, SelectLabel, SelectItem, SelectSeparator,
  Text, VStack,
} from '@tallyui/components';

export default function SelectScreen() {
  const [fruit, setFruit] = useState('');
  const [country, setCountry] = useState('');

  return (
    <>
      <Stack.Screen options={{ title: 'Select' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Select</Text>
          <Select value={fruit} onValueChange={setFruit}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a fruit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
              <SelectItem value="cherry">Cherry</SelectItem>
              <SelectItem value="mango">Mango</SelectItem>
            </SelectContent>
          </Select>
          <Text className="text-sm text-muted-foreground">
            Selected: {fruit || 'none'}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Grouped Options</Text>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a country" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Americas</SelectLabel>
                <SelectItem value="us">United States</SelectItem>
                <SelectItem value="ca">Canada</SelectItem>
                <SelectItem value="br">Brazil</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Europe</SelectLabel>
                <SelectItem value="gb">United Kingdom</SelectItem>
                <SelectItem value="de">Germany</SelectItem>
                <SelectItem value="fr">France</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Asia-Pacific</SelectLabel>
                <SelectItem value="au">Australia</SelectItem>
                <SelectItem value="jp">Japan</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Text className="text-sm text-muted-foreground">
            Selected: {country || 'none'}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Fixed Width</Text>
          <Select defaultValue="medium">
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
              <SelectItem value="xl">Extra Large</SelectItem>
            </SelectContent>
          </Select>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
