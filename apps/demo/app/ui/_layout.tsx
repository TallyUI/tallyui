import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../lib/use-stack-screen-options';

export default function UILayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack
      screenOptions={screenOptions}
    />
  );
}
