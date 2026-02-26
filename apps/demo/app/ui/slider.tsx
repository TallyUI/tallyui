import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Slider, Text, VStack } from '@tallyui/components';

export default function SliderScreen() {
  const [volume, setVolume] = useState(50);
  const [brightness, setBrightness] = useState(75);
  const [step, setStep] = useState(50);

  return (
    <>
      <Stack.Screen options={{ title: 'Slider' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Controlled</Text>
          <Text className="text-sm text-muted-foreground">Volume: {volume}%</Text>
          <Slider value={volume} onValueChange={setVolume} />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Default Value</Text>
          <Slider defaultValue={30} />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Custom Range (0-10)</Text>
          <Text className="text-sm text-muted-foreground">Brightness: {brightness / 10}</Text>
          <Slider
            min={0}
            max={100}
            step={10}
            value={brightness}
            onValueChange={setBrightness}
          />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Step Increments (25)</Text>
          <Text className="text-sm text-muted-foreground">Value: {step}</Text>
          <Slider
            min={0}
            max={100}
            step={25}
            value={step}
            onValueChange={setStep}
          />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <Slider value={40} disabled />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Practical: Price Range</Text>
          <Text className="text-sm text-muted-foreground">
            Max price: ${volume}
          </Text>
          <Slider min={0} max={200} step={5} value={volume} onValueChange={setVolume} />
        </VStack>
      </ScrollView>
    </>
  );
}
