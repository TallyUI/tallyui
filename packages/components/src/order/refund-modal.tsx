import type { JSX } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog';
import { IconButton } from '../ui/icon-button';
import { XIcon } from '../ui/icon/x-icon';
import { RefundForm, type RefundFormProps } from './refund-form';

export interface RefundModalProps extends Omit<RefundFormProps, 'onCancel'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Ports WCPOS v2 modal.tsx: a bounded panel around the refund form. */
export function RefundModal({ open, onOpenChange, ...formProps }: RefundModalProps): JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = Math.max(320, windowHeight - 64);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent testID="refund-modal" className="flex-col overflow-hidden" style={{ maxHeight }}>
        <View className="flex-row items-center justify-between gap-2">
          <DialogTitle>{`Refund Order #${formProps.orderReference}`}</DialogTitle>
          <DialogClose asChild>
            <IconButton variant="ghost" size="sm" testID="refund-modal-dismiss" accessibilityLabel="Close panel">
              <XIcon size={16} />
            </IconButton>
          </DialogClose>
        </View>
        <RefundForm {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
