// Port of WCPOS v2's Order details note field, MIT, WCPOS:
// packages/core/src/screens/main/pos/cart/foot.tsx, note-row.tsx, order-sheet.tsx,
// and buttons/edit-order-meta/form.tsx:431-444 (note), 599-625 (Tax exempt), relative to that cart directory.
// The exemption reason fields are TallyUI's own; v2 has none.
import type { JSX } from 'react';
import { View } from 'react-native';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
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
  /** The staff-only exemption reason fields, drawn under the Tax exempt switch while it is on. Absent: no fields. */
  taxExemptReason?: { required: boolean; text: string; certificateId: string;
    onChange: (next: { text: string; certificateId: string }) => void; notSent?: boolean; error?: string | null };
}

export function OrderNoteSheet({ value, onChangeText, onOpenChange, label = 'Customer note', taxExempt, taxExemptReason }: OrderNoteSheetProps): JSX.Element {
  const reasonLabel = taxExemptReason?.required ? 'Exemption reason (required)' : 'Exemption reason';
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
          {taxExempt.checked && taxExemptReason ? <>
            <Label nativeID="order-tax-exempt-reason-label">{reasonLabel}</Label>
            <Textarea testID="order-tax-exempt-reason-input" maxLength={200} value={taxExemptReason.text}
              accessibilityLabel={reasonLabel} accessibilityLabelledBy="order-tax-exempt-reason-label"
              onChangeText={(text) => taxExemptReason.onChange({ text, certificateId: taxExemptReason.certificateId })} />
            <Label nativeID="order-tax-exempt-certificate-label">Certificate number (optional)</Label>
            <Input><Input.Field testID="order-tax-exempt-certificate-input" maxLength={64} value={taxExemptReason.certificateId}
              accessibilityLabel="Certificate number (optional)" accessibilityLabelledBy="order-tax-exempt-certificate-label"
              onChangeText={(certificateId) => taxExemptReason.onChange({ text: taxExemptReason.text, certificateId })} /></Input>
            {taxExemptReason.notSent ? <Text testID="order-tax-exempt-reason-not-sent" className="text-sm text-muted-foreground">This store cannot receive the reason yet. It stays on this till only.</Text> : null}
            {taxExemptReason.error ? <Text accessibilityRole="alert" testID="order-tax-exempt-reason-error" className="text-sm text-destructive">{taxExemptReason.error}</Text> : null}
          </> : null}
          {taxExempt.error ? <Text accessibilityRole="alert" testID="order-tax-exempt-error" className="text-sm text-destructive">{taxExempt.error}</Text> : null}
        </View> : null}
        <Button testID="order-note-close" onPress={() => onOpenChange(false)}>
          <Text>Close</Text>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
