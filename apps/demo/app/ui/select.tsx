import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectGroup, SelectLabel, SelectItem, SelectSeparator,
  Text, VStack,
} from '@tallyui/components';

interface Option {
  value: string;
  label: string;
}

export default function SelectScreen() {
  const [fruit, setFruit] = useState<Option | undefined>();
  const [country, setCountry] = useState<Option | undefined>();

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
              <SelectItem value="apple" label="Apple">Apple</SelectItem>
              <SelectItem value="banana" label="Banana">Banana</SelectItem>
              <SelectItem value="cherry" label="Cherry">Cherry</SelectItem>
              <SelectItem value="mango" label="Mango">Mango</SelectItem>
            </SelectContent>
          </Select>
          <Text className="text-sm text-muted-foreground">
            Selected: {fruit?.label || 'none'}
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
                <SelectItem value="us" label="United States">United States</SelectItem>
                <SelectItem value="ca" label="Canada">Canada</SelectItem>
                <SelectItem value="br" label="Brazil">Brazil</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Europe</SelectLabel>
                <SelectItem value="gb" label="United Kingdom">United Kingdom</SelectItem>
                <SelectItem value="de" label="Germany">Germany</SelectItem>
                <SelectItem value="fr" label="France">France</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Asia-Pacific</SelectLabel>
                <SelectItem value="au" label="Australia">Australia</SelectItem>
                <SelectItem value="jp" label="Japan">Japan</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Text className="text-sm text-muted-foreground">
            Selected: {country?.label || 'none'}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Fixed Width</Text>
          <Select defaultValue={{ value: 'medium', label: 'Medium' }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small" label="Small">Small</SelectItem>
              <SelectItem value="medium" label="Medium">Medium</SelectItem>
              <SelectItem value="large" label="Large">Large</SelectItem>
              <SelectItem value="xl" label="Extra Large">Extra Large</SelectItem>
            </SelectContent>
          </Select>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
