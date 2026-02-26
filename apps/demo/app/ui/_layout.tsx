import { Stack } from 'expo-router';

export default function UILayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#f8f9fa' },
        headerTitleStyle: { fontWeight: '600' },
      }}
    />
  );
}
