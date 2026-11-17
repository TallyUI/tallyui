// Port of WCPOS v2's Order details note field, MIT, WCPOS:
// packages/core/src/screens/main/pos/cart/foot.tsx, note-row.tsx, order-sheet.tsx,
// and buttons/edit-order-meta/form.tsx:431-444 (paths relative to that cart directory).
import type { JSX } from 'react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

export interface OrderNoteSheetProps {
  /** The note as it stands; the sheet edits it live, as v2's autosaved field does. */
  value: string;
  onChangeText: (text: string) => void;
  onOpenChange: (open: boolean) => void;
  /** The note's name: the field's label and accessible name, and "Add <label lower-cased>" as its placeholder.
   * Default "Customer note" (WooCommerce's customer_note, which the customer sees). */
  label?: string;
}

export function OrderNoteSheet({ value, onChangeText, onOpenChange, label = 'Customer note' }: OrderNoteSheetProps): JSX.Element {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* v2 opens the order sheet away from the cart so the cart's note row stays in view. */}
      <DialogContent side="left" testID="order-note-sheet">
        <DialogTitle>Order details</DialogTitle>
        <Label nativeID="order-note-label">{label}</Label>
        <Textarea testID="order-note-input" value={value} onChangeText={onChangeText}
          accessibilityLabel={label} accessibilityLabelledBy="order-note-label"
          placeholder={`Add ${label.toLowerCase()}`} />
        <Button testID="order-note-close" onPress={() => onOpenChange(false)}>
          <Text>Close</Text>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
