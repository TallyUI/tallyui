import { ScrollView } from 'react-native';

import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Text } from '../ui/text';
import { VStack } from '../ui/vstack';

export interface RegisterPickerRegister {
  id: string;
  name: string;
}

export interface RegisterPickerProps {
  /** The app's own list of registers for this store; there's no `useRegisterSession` yet to bind. */
  registers: RegisterPickerRegister[];
  onPick: (id: string) => void;
  className?: string;
}

/**
 * The register-choice screen: shown before a till is bound to any register. Port provenance
 * (ADR-032 amendment 1): WCPOS `next` `3b5331b5c` `register-picker.tsx`.
 *
 * Neutral change: the app supplies `registers` and binds on `onPick` itself — TallyUI has no
 * `useRegisterBinding` concept; binding is entirely the app's own (ADR-032 amendment 1).
 */
export function RegisterPicker({ registers, onPick, className }: RegisterPickerProps) {
  return (
    <Card testID="register-picker" className={className}>
      <CardHeader>
        <CardTitle>Choose a register</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollView>
          {registers.map((register) => (
            <Button
              key={register.id}
              testID={`register-picker-row-${register.id}`}
              variant="ghost"
              className="h-auto min-h-11 items-start justify-start py-2"
              onPress={() => onPick(register.id)}
            >
              <VStack space="none">
                <Text numberOfLines={1}>{register.name}</Text>
                <Text testID={`register-picker-row-${register.id}-status`} className="text-muted-foreground text-sm">
                  Not opened
                </Text>
              </VStack>
            </Button>
          ))}
          {registers.length === 0 && (
            <Text testID="register-picker-empty" className="text-muted-foreground p-4">
              No registers are set up for this store yet.
            </Text>
          )}
        </ScrollView>
      </CardContent>
    </Card>
  );
}
