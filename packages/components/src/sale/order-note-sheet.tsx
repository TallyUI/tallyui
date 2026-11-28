// Port of WCPOS v2's Order details note field, MIT, WCPOS:
// packages/core/src/screens/main/pos/cart/foot.tsx, note-row.tsx, order-sheet.tsx,
// and buttons/edit-order-meta/form.tsx:431-444 (note), 599-625 (Tax exempt), relative to that cart directory.
import type { JSX } from 'react';
import { View } from 'react-native';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
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
  /** v2's Order details "Tax exempt" switch (edit-order-meta/form.tsx). Absent: no row. */
  taxExempt?: { checked: boolean; onCheckedChange: (on: boolean) => void; error?: string | null };
}

export function OrderNoteSheet({ value, onChangeText, onOpenChange, label = 'Customer note', taxExempt }: OrderNoteSheetProps): JSX.Element {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* v2 opens the order sheet away from the cart so the cart's note row stays in view. */}
      <DialogContent side="left" testID="order-note-sheet">
        <DialogTitle>Order details</DialogTitle>
        <Label nativeID="order-note-label">{label}</Label>
        <Textarea testID="order-note-input" value={value} onChangeText={onChangeText}
          accessibilityLabel={label} accessibilityLabelledBy="order-note-label"
          placeholder={`Add ${label.toLowerCase()}`} />
        {taxExempt ? <View className="gap-1">
          <View className="flex-row items-center justify-between">
            <Label nativeID="order-tax-exempt-label">Tax exempt</Label>
            <Switch testID="order-tax-exempt-switch" accessibilityLabel="Tax exempt" accessibilityLabelledBy="order-tax-exempt-label"
              checked={taxExempt.checked} onCheckedChange={taxExempt.onCheckedChange} />
          </View>
          <Text className="text-sm text-muted-foreground">Removes all tax from this order, including fees and shipping.</Text>
          {taxExempt.error ? <Text accessibilityRole="alert" testID="order-tax-exempt-error" className="text-sm text-destructive">{taxExempt.error}</Text> : null}
        </View> : null}
        <Button testID="order-note-close" onPress={() => onOpenChange(false)}>
          <Text>Close</Text>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
