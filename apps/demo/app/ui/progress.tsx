import { useState, useEffect } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Progress, Text, VStack, Button } from '@tallyui/components';

export default function ProgressScreen() {
  const [auto, setAuto] = useState(0);
  const [manual, setManual] = useState(30);

  useEffect(() => {
    const timer = setInterval(() => {
      setAuto((prev) => (prev >= 100 ? 0 : prev + 5));
    }, 300);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Progress' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Animated</Text>
          <Text className="text-sm text-muted-foreground">{auto}%</Text>
          <Progress value={auto} />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Static Values</Text>
          <Text className="text-sm text-muted-foreground">0%</Text>
          <Progress value={0} />
          <Text className="text-sm text-muted-foreground">25%</Text>
          <Progress value={25} />
          <Text className="text-sm text-muted-foreground">50%</Text>
          <Progress value={50} />
          <Text className="text-sm text-muted-foreground">75%</Text>
          <Progress value={75} />
          <Text className="text-sm text-muted-foreground">100%</Text>
          <Progress value={100} />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Interactive</Text>
          <Text className="text-sm text-muted-foreground">Value: {manual}%</Text>
          <Progress value={manual} />
          <VStack className="flex-row gap-2">
            <Button
              size="sm"
              variant="outline"
              onPress={() => setManual((v) => Math.max(0, v - 10))}
            >
              <Text>-10</Text>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onPress={() => setManual((v) => Math.min(100, v + 10))}
            >
              <Text>+10</Text>
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setManual(0)}>
              <Text>Reset</Text>
            </Button>
          </VStack>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Custom Max</Text>
          <Text className="text-sm text-muted-foreground">3 of 5 steps</Text>
          <Progress value={3} max={5} />
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Practical: File Upload</Text>
          <Text className="text-sm text-muted-foreground">
            Uploading... {auto}%
          </Text>
          <Progress value={auto} />
        </VStack>
      </ScrollView>
    </>
  );
}
