/**
 * The receipt print sheet: template choice, printer, the preview, and Close / Email Receipt / Print.
 * Layout of WCPOS v2, MIT, WCPOS: packages/core/src/screens/main/receipt/receipt.tsx, print-sheet.tsx,
 * receipt-body.tsx, template-switcher.tsx, printer-switcher.tsx and receipt-actions.tsx; the strings are v2's English ones from core.json;
 * after a send the sheet shows v2's 'Email sent' / 'Receipt email queued' as a line, not a toast.
 * Props-only: the sheet renders no receipt and prints nothing itself.
 */
import { useState, type JSX, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { PrinterIcon } from '../ui/icon/printer-icon';
import { Loader } from '../ui/loader';
import { Text } from '../ui/text';
import { useT } from '../i18n';

export interface ReceiptSheetTemplate {
  id: string;
  title: string;
  /** Shown but not choosable (v2: offline and not offline-capable). */
  disabled?: boolean;
}

export interface ReceiptSheetEmail {
  /** Prefills "Email Address" (v2: the order's billing email). */
  defaultAddress?: string;
  /** Draws v2's offline notice; Send reads "Send when online". */
  offline?: boolean;
  /** Draws "Save email to the customer" (default off). */
  saveToCustomer?: boolean;
  /** Sends or queues the receipt. Returns a refusal to show, or null once sent or queued; the form then closes. */
  onSend: (input: { address: string; saveToCustomer: boolean }) => Promise<string | null> | string | null;
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
  /** v2's printer switcher. The app keeps the pick, for this print only, and resets it when the template changes, as v2 does. */
  printers?: readonly { id: string; name?: string }[];
  /** The cashier's pick for this print; null or undefined is Auto. */
  printerId?: string | null;
  /** The name Auto resolves to, worked out by the app (for example with `resolvePrinter` from `@tallyui/pos`). */
  autoPrinterName?: string;
  /** Called with the picked printer's id, or null for Auto. */
  onPrinterChange?: (id: string | null) => void;
  onPrint: () => void;
  /** Print shows its loading state and cannot be pressed. */
  printing?: boolean;
  /** Print reads "Print again". */
  printed?: boolean;
  /** "Email Receipt" is drawn only when given. */
  onEmail?: () => void;
  /** v2's email form: "Email Receipt" opens it inside the sheet. When given, it takes the place of `onEmail`. */
  email?: ReceiptSheetEmail;
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

const AUTO = '__auto__';

/** v2's printer-switcher.tsx: Auto first, then every printer by name, falling back to its id. */
function PrinterValue({ printers, printerId, autoPrinterName, onPrinterChange }:
  Required<Pick<ReceiptSheetProps, 'printers'>> & Pick<ReceiptSheetProps, 'printerId' | 'autoPrinterName' | 'onPrinterChange'>) {
  const labelOf = (printer: { id: string; name?: string }) => printer.name?.trim() || printer.id;
  const current = printers.find((printer) => printer.id === printerId);
  const value = current
    ? { value: current.id, label: labelOf(current) }
    : { value: AUTO, label: autoPrinterName ? `Auto — ${autoPrinterName}` : 'Auto' };
  return (
    <Select value={value} onValueChange={(option) => {
      if (option && option.value !== value.value) onPrinterChange?.(option.value === AUTO ? null : option.value);
    }}>
      <SelectTrigger testID="receipt-printer-select" accessibilityLabel="Printer" className="h-11 w-56 gap-2">
        <SelectValue placeholder="Select printer" className="shrink text-sm text-foreground" numberOfLines={1} />
      </SelectTrigger>
      <SelectContent className="w-56">
        <SelectItem value={AUTO} label="Auto" testID="receipt-printer-auto" className="min-h-11">
          <Text className="text-sm">Auto</Text>
        </SelectItem>
        {printers.map((printer) => (
          <SelectItem key={printer.id} value={printer.id} label={labelOf(printer)} testID={`receipt-printer-${printer.id}`} className="min-h-11">
            <Text className="text-sm">{labelOf(printer)}</Text>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

/** v2's email.tsx (MIT, WCPOS) inline: it mounts fresh on each open, so it starts from defaultAddress, switch off, no error. */
function EmailForm({ email, onDone }: { email: ReceiptSheetEmail; onDone: (queued: boolean) => void }) {
  const [text, setText] = useState(email.defaultAddress ?? '');
  const [save, setSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (sending) return;
    const address = text.trim();
    if (!EMAIL_PATTERN.test(address)) return setError('Enter an email address.');
    setError(null);
    let refusal: string | null;
    try {
      const result = email.onSend({ address, saveToCustomer: save });
      if (typeof result === 'string' || result === null) refusal = result;
      else { setSending(true); refusal = await result; }
    } catch (cause) {
      refusal = cause instanceof Error ? cause.message : 'Could not send the receipt.';
    }
    setSending(false);
    if (refusal === null) onDone(Boolean(email.offline)); else setError(refusal);
  };
  return (
    <View testID="receipt-email-form" className="gap-2 py-2">
      <Text className="text-sm font-medium text-foreground">Email Address</Text>
      <Input><Input.Field testID="receipt-email-address" accessibilityLabel="Email Address" value={text} onChangeText={setText}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /></Input>
      {email.saveToCustomer ? (
        <SheetRow testID="receipt-email-save-row" label="Save email to the customer">
          <Switch testID="receipt-email-save" accessibilityLabel="Save email to the customer" checked={save} onCheckedChange={setSave} />
        </SheetRow>
      ) : null}
      {email.offline ? (
        <Text testID="receipt-email-offline" className="text-sm text-muted-foreground">
          This device can’t reach your store right now. The receipt will be emailed automatically when the connection returns.
        </Text>
      ) : null}
      {error ? <Text testID="receipt-email-error" accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}
      <Button testID="receipt-email-send" className="self-end" onPress={() => void send()} disabled={sending}
        accessibilityState={{ disabled: sending, busy: sending }}>
        {sending ? <Loader size="sm" /> : null}
        <Text>{email.offline ? 'Send when online' : 'Send'}</Text>
      </Button>
    </View>
  );
}

export function ReceiptSheet({ open, onOpenChange, title = 'Receipt', templates, templateId, onTemplateChange,
  printerLabel = 'Browser print dialog', printers, printerId, autoPrinterName, onPrinterChange,
  onPrint, printing = false, printed = false, onEmail, email, children }: ReceiptSheetProps): JSX.Element {
  const t = useT();
  const [sent, setSent] = useState<'sent' | 'queued' | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  // Closing the sheet closes the form too, so it opens fresh next time.
  if (!open && (emailOpen || sent)) { setEmailOpen(false); setSent(null); }
  const onEmailPress = email ? () => { setSent(null); setEmailOpen((was) => !was); } : onEmail;
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
          {/* v2's printer-switcher.tsx when the app passes printers; otherwise the app's one label. */}
          <SheetRow testID="print-sheet-printer" label="Printer">
            {printers && printers.length > 0 ? (
              <PrinterValue printers={printers} printerId={printerId} autoPrinterName={autoPrinterName} onPrinterChange={onPrinterChange} />
            ) : <Text className="text-sm text-foreground">{printerLabel}</Text>}
          </SheetRow>
        </View>
        {/* v2 draws its own WebView preview with zoom and loading states; here the app's preview is the child. */}
        <ScrollView className="flex-1" contentContainerClassName="pb-2">{children}</ScrollView>
        {email && emailOpen ? <EmailForm email={email} onDone={(queued) => { setEmailOpen(false); setSent(queued ? 'queued' : 'sent'); }} /> : null}
        {email && sent ? <Text testID="receipt-email-sent" className="py-2 text-sm text-foreground">{t(sent === 'queued' ? 'receipt.email_queued' : 'receipt.email_sent')}</Text> : null}
        {/* v2's footer also has Download PDF and Sync order; TallyUI has neither. `email` draws v2's form above, the app sends. */}
        <DialogFooter bordered className="gap-2" testID="receipt-footer">
          <DialogClose asChild>
            <Button variant="outline" testID="receipt-close-button"><Text>Close</Text></Button>
          </DialogClose>
          {onEmailPress ? (
            <Button variant="outline" testID="receipt-email-button" onPress={onEmailPress}><Text>Email Receipt</Text></Button>
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
