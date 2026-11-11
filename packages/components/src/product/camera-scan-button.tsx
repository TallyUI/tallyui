import { View } from 'react-native';
import { IconButton } from '../ui/icon-button';
import { ScanIcon } from '../ui/icon/scan-icon';
import { Text } from '../ui/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export interface CameraScanButtonProps {
  /** The camera scanner is showing: the button then closes it. */
  open: boolean;
  onPress: () => void;
  testID?: string;
}

/** Opens and closes the camera scanner panel (v2 pos/products/camera-scan-button.tsx). */
export function CameraScanButton({ open, onPress, testID = 'camera-scan-button' }: CameraScanButtonProps) {
  const label = open ? 'Close barcode scanner' : 'Scan barcode with camera';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton variant={open ? 'secondary' : 'ghost'} testID={testID} accessibilityLabel={label}
          accessibilityState={{ expanded: open }} onPress={onPress}>
          <View className={open ? 'text-secondary-foreground' : 'text-foreground'}><ScanIcon size={20} /></View>
        </IconButton>
      </TooltipTrigger>
      <TooltipContent><Text>{label}</Text></TooltipContent>
    </Tooltip>
  );
}
