import { useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { RegisterOpenClose, CashCountInput, Text } from '@tallyui/components';

export default function RegisterOpenCloseScreen() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'RegisterOpenClose' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">
            Register is {isOpen ? 'Open' : 'Closed'}
          </Text>
          <RegisterOpenClose
            isOpen={isOpen}
            onOpen={() => {
              setIsOpen(true);
              Alert.alert('Register Opened');
            }}
            onClose={() => {
              setIsOpen(false);
              Alert.alert('Register Closed');
            }}
            expectedBalance={isOpen ? 523.47 : undefined}
            cashCountSlot={
              <CashCountInput
                denominations={[
                  { label: '$20', value: 20 },
                  { label: '$10', value: 10 },
                  { label: '$5', value: 5 },
                  { label: '$1', value: 1 },
                ]}
              />
            }
          />
        </View>
      </ScrollView>
    </>
  );
}
