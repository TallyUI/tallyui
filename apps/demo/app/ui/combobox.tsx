import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  Combobox, ComboboxTrigger, ComboboxInput,
  ComboboxContent, ComboboxItem, ComboboxEmpty,
  Text, VStack,
} from '@tallyui/components';

interface Option {
  value: string;
  label: string;
}

const frameworks: Option[] = [
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'angular', label: 'Angular' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'solid', label: 'Solid' },
  { value: 'qwik', label: 'Qwik' },
];

const countries: Option[] = [
  { value: 'us', label: 'United States' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'jp', label: 'Japan' },
  { value: 'br', label: 'Brazil' },
];

export default function ComboboxScreen() {
  const [framework, setFramework] = useState<Option | undefined>();
  const [country, setCountry] = useState<Option | undefined>();

  return (
    <>
      <Stack.Screen options={{ title: 'Combobox' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic Combobox</Text>
          <Combobox value={framework} onValueChange={setFramework}>
            <ComboboxTrigger>
              <ComboboxInput placeholder="Search frameworks..." />
            </ComboboxTrigger>
            <ComboboxContent>
              {frameworks.map((f) => (
                <ComboboxItem key={f.value} value={f.value} label={f.label}>
                  {f.label}
                </ComboboxItem>
              ))}
              <ComboboxEmpty />
            </ComboboxContent>
          </Combobox>
          <Text className="text-sm text-muted-foreground">
            Selected: {framework?.label || 'none'}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Country Picker</Text>
          <Text className="text-sm text-muted-foreground">
            A longer list to demonstrate scrolling and filtering.
          </Text>
          <Combobox value={country} onValueChange={setCountry}>
            <ComboboxTrigger>
              <ComboboxInput placeholder="Search countries..." />
            </ComboboxTrigger>
            <ComboboxContent>
              {countries.map((c) => (
                <ComboboxItem key={c.value} value={c.value} label={c.label}>
                  {c.label}
                </ComboboxItem>
              ))}
              <ComboboxEmpty />
            </ComboboxContent>
          </Combobox>
          <Text className="text-sm text-muted-foreground">
            Selected: {country?.label || 'none'}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Fixed Width</Text>
          <Combobox>
            <ComboboxTrigger className="w-64">
              <ComboboxInput placeholder="Pick a color..." />
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxItem value="red" label="Red">Red</ComboboxItem>
              <ComboboxItem value="green" label="Green">Green</ComboboxItem>
              <ComboboxItem value="blue" label="Blue">Blue</ComboboxItem>
              <ComboboxItem value="purple" label="Purple">Purple</ComboboxItem>
              <ComboboxEmpty />
            </ComboboxContent>
          </Combobox>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
