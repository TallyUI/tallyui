import type * as React from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '../alert-dialog';
import { Button } from '../button';
import { Text } from '../text';

export interface ConfirmDialogProps {
  title: string;
  description?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  confirmLabel: string;
  /** Default 'destructive'. */
  tone?: 'destructive' | 'default';
  /** Called on the confirm button; the dialog then closes. */
  onConfirm: () => void;
  /** Cancel is `${testID}-cancel` and confirm `${testID}-confirm` unless `cancelTestID` / `confirmTestID` say otherwise. */
  testID: string;
  cancelTestID?: string;
  confirmTestID?: string;
  /** The element that opens the dialog, rendered with `AlertDialogTrigger asChild`. Leave it out when the caller controls `open`. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Inventory C9: the one confirm dialog in TallyUI. */
export function ConfirmDialog({
  title, description, cancelLabel, confirmLabel, tone, onConfirm, testID, cancelTestID, confirmTestID,
  trigger, open, onOpenChange,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent testID={testID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button testID={cancelTestID ?? `${testID}-cancel`} variant="outline" className="min-h-11"><Text>{cancelLabel ?? 'Cancel'}</Text></Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button testID={confirmTestID ?? `${testID}-confirm`} variant={tone === 'default' ? 'default' : 'destructive'} className="min-h-11" onPress={onConfirm}><Text>{confirmLabel}</Text></Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
