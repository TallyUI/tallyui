import { View } from 'react-native';
import { cn } from '@tallyui/theme';

export function PressVeil({ pressed, className, testID }: { pressed: boolean; className?: string; testID?: string }) {
  if (!pressed) return null;
  return <View pointerEvents="none" aria-hidden testID={testID} className={cn('absolute inset-0 bg-foreground/10', className)} />;
}
