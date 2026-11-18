/**
 * The receipt print sheet: template choice, printer, the preview, and Close / Email Receipt / Print.
 * Layout of WCPOS v2, MIT, WCPOS: packages/core/src/screens/main/receipt/receipt.tsx, print-sheet.tsx,
 * receipt-body.tsx, template-switcher.tsx and receipt-actions.tsx; the strings are v2's English ones from core.json.
 * Props-only: the sheet renders no receipt and prints nothing itself.
 */
import type { JSX, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { PrinterIcon } from '../ui/icon/printer-icon';
import { Loader } from '../ui/loader';
import { Text } from '../ui/text';

export interface ReceiptSheetTemplate {
  id: string;
  title: string;
  /** Shown but not choosable (v2: offline and not offline-capable). */
  disabled?: boolean;
}

export interface ReceiptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Default "Receipt". */
  title?: string;
  templates: readonly ReceiptSheetTemplate[];
  templateId?: string;
  onTemplateChange?: (id: string) => void;
  /** The Printer row's text. Default "Browser print dialog". */
  printerLabel?: string;
  onPrint: () => void;
  /** Print shows its loading state and cannot be pressed. */
  printing?: boolean;
  /** Print reads "Print again". */
  printed?: boolean;
  /** "Email Receipt" is drawn only when given. */
  onEmail?: () => void;
  /** The preview. */
  children: ReactNode;
}

/** v2's property list row: label left, value right (as SettingsRow lays one out, without the card). */
function SheetRow({ testID, label, children }: { testID: string; label: string; children: ReactNode }) {
  return (
    <View testID={testID} className="min-h-11 flex-row items-center gap-3">
      <Text className="flex-1 text-sm font-medium text-foreground">{label}</Text>
      {children}
    </View>
  );
}

function TemplateValue({ templates, templateId, onTemplateChange }:
  Pick<ReceiptSheetProps, 'templates' | 'templateId' | 'onTemplateChange'>) {
  if (templates.length === 1) return <Text className="text-sm text-foreground">{templates[0].title}</Text>;
  const current = templates.find((template) => template.id === templateId);
  return (
    <Select value={current ? { value: current.id, label: current.title } : undefined}
      onValueChange={(option) => { if (option && option.value !== templateId) onTemplateChange?.(option.value); }}>
      <SelectTrigger testID="receipt-template-select" accessibilityLabel="Template" className="h-11 w-56 gap-2">
        <SelectValue placeholder="Select template" className="shrink text-sm text-foreground" numberOfLines={1} />
      </SelectTrigger>
      <SelectContent className="w-56">
        {templates.map((template) => (
          <SelectItem key={template.id} value={template.id} label={template.title} disabled={template.disabled}
            testID={`receipt-template-${template.id}`} className={cn('min-h-11', template.disabled && 'opacity-50')}>
            <Text className="text-sm">{template.title}</Text>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReceiptSheet({ open, onOpenChange, title = 'Receipt', templates, templateId, onTemplateChange,
  printerLabel = 'Browser print dialog', onPrint, printing = false, printed = false, onEmail, children }: ReceiptSheetProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" testID="receipt-dialog" className="flex-col" showClose>
        <DialogHeader>
          {/* v2 titles a refund document "Refund receipt"; TallyUI's app passes `title` for that. */}
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <View>
          {templates.length === 0 ? null : (
            <SheetRow testID="print-sheet-template" label="Template">
              <TemplateValue templates={templates} templateId={templateId} onTemplateChange={onTemplateChange} />
            </SheetRow>
          )}
          {/* v2 offers a printer switcher here; TallyUI shows the app's one label until a printer list exists. */}
          <SheetRow testID="print-sheet-printer" label="Printer">
            <Text className="text-sm text-foreground">{printerLabel}</Text>
          </SheetRow>
        </View>
        {/* v2 draws its own WebView preview with zoom and loading states; here the app's preview is the child. */}
        <ScrollView className="flex-1" contentContainerClassName="pb-2">{children}</ScrollView>
        {/* v2's footer also has Download PDF and Sync order; TallyUI has neither, and the app opens its own email form. */}
        <DialogFooter bordered className="gap-2" testID="receipt-footer">
          <DialogClose asChild>
            <Button variant="outline" testID="receipt-close-button"><Text>Close</Text></Button>
          </DialogClose>
          {onEmail ? (
            <Button variant="outline" testID="receipt-email-button" onPress={onEmail}><Text>Email Receipt</Text></Button>
          ) : null}
          <Button testID="receipt-print-button" onPress={onPrint} disabled={printing}
            accessibilityState={{ disabled: printing, busy: printing }}>
            {printing ? <Loader size="sm" /> : <PrinterIcon size={16} className="text-primary-foreground" />}
            <Text>{printed ? 'Print again' : 'Print receipt'}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
