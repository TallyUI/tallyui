import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { RadioGroup, RadioGroupItem, Label, Text, VStack } from '@tallyui/components';

const sizes = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const plans = [
  { value: 'free', label: 'Free', desc: 'Basic features for personal use' },
  { value: 'pro', label: 'Pro', desc: 'Advanced features for professionals' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Full access for teams' },
];

export default function RadioGroupScreen() {
  const [size, setSize] = useState('medium');
  const [plan, setPlan] = useState('pro');

  return (
    <>
      <Stack.Screen options={{ title: 'RadioGroup' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Basic</Text>
          <RadioGroup value={size} onValueChange={setSize}>
            {sizes.map((s) => (
              <View key={s.value} className="flex-row items-center gap-2">
                <RadioGroupItem value={s.value} nativeID={s.value} />
                <Label nativeID={s.value}>
                  <Text>{s.label}</Text>
                </Label>
              </View>
            ))}
          </RadioGroup>
          <Text className="text-sm text-muted-foreground">
            Selected: {size}
          </Text>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled Items</Text>
          <RadioGroup defaultValue="free">
            <View className="flex-row items-center gap-2">
              <RadioGroupItem value="free" nativeID="d-free" />
              <Label nativeID="d-free">
                <Text>Free</Text>
              </Label>
            </View>
            <View className="flex-row items-center gap-2">
              <RadioGroupItem value="pro" disabled nativeID="d-pro" />
              <Label nativeID="d-pro">
                <Text className="text-muted-foreground">Pro (coming soon)</Text>
              </Label>
            </View>
            <View className="flex-row items-center gap-2">
              <RadioGroupItem value="enterprise" nativeID="d-enterprise" />
              <Label nativeID="d-enterprise">
                <Text>Enterprise</Text>
              </Label>
            </View>
          </RadioGroup>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Card Selection</Text>
          <Text className="text-sm text-muted-foreground">
            Radio items inside styled cards for a richer selection UI.
          </Text>
          <RadioGroup value={plan} onValueChange={setPlan}>
            {plans.map((p) => (
              <View
                key={p.value}
                className={`flex-row items-center gap-3 rounded-lg border px-4 py-3 ${
                  plan === p.value ? 'border-primary' : 'border-border'
                }`}
              >
                <RadioGroupItem value={p.value} nativeID={`plan-${p.value}`} />
                <VStack className="gap-0.5 flex-1">
                  <Label nativeID={`plan-${p.value}`}>
                    <Text className="text-sm font-medium">{p.label}</Text>
                  </Label>
                  <Text className="text-xs text-muted-foreground">{p.desc}</Text>
                </VStack>
              </View>
            ))}
          </RadioGroup>
        </VStack>
      </ScrollView>
    </>
  );
}
