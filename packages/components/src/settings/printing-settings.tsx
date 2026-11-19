/**
 * Settings › Printing, the Printers section: ported from WCPOS v2 `packages/core/src/screens/main/settings/printing/`
 * (`index.tsx`, `printer-row.tsx`). Props only; the app passes the printers and wires every callback, and opens its
 * own add/edit dialog from `onAdd` / `onEdit` and shows the result of `onTest`. Left out (later rows): template
 * routing, "Copy setup report", the "Having trouble?" docs link and the test-print toast.
 */
import { useState, type JSX } from 'react';
import { View } from 'react-native';
import { Circle } from 'react-native-svg';
import type { PrinterProfile } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { createSvgIcon } from '../ui/icon/svg-icon';
import { IconButton } from '../ui/icon-button';
import { Loader } from '../ui/loader';
import { Text } from '../ui/text';
import { SettingsGroup } from './settings-group';

export interface PrintingSettingsProps {
  printers: readonly PrinterProfile[];
  /** v2's isLoading: the section shows its title only. Default false. */
  loading?: boolean;
  /** Ids of printers whose test print is running; their Test Print button shows its loading state. */
  testingIds?: ReadonlySet<string>;
  onTest: (printer: PrinterProfile) => void;
  onEdit: (printer: PrinterProfile) => void;
  onSetDefault: (id: string) => void;
  /** Called after the cashier confirms the delete dialog. */
  onDelete: (id: string) => void;
  onAdd: () => void;
  className?: string;
}

// Lucide ellipsis (ISC). TallyUI's settings rows have no row icon and there is no printer icon, so this is the only one.
const MoreIcon = createSvgIcon('MoreIcon', () => (
  <>
    <Circle cx="12" cy="12" r="1" />
    <Circle cx="19" cy="12" r="1" />
    <Circle cx="5" cy="12" r="1" />
  </>
));

const NO_TESTS: ReadonlySet<string> = new Set();

// v2's usesSystemPrintDialog also checks a `winspool` address (a Windows queue); TallyUI has no Windows queue lane,
// so every `system` printer is the Print Dialog.
const isPrintDialog = (printer: PrinterProfile) => printer.connectionType === 'system';

function connectionLabel(printer: PrinterProfile): string {
  if (isPrintDialog(printer)) return 'Print Dialog · built-in';
  const host = printer.address || '?';
  const base = printer.port ? `${host}:${printer.port}` : host;
  if (printer.vendor === 'epson') return `${base} · Epson`;
  if (printer.vendor === 'star') return `${base} · Star`;
  return base;
}

interface PrinterRowProps extends Pick<PrintingSettingsProps, 'onTest' | 'onEdit' | 'onSetDefault'> {
  printer: PrinterProfile;
  testing: boolean;
  onDelete: (printer: PrinterProfile) => void;
}

function PrinterRow({ printer, testing, onTest, onEdit, onSetDefault, onDelete }: PrinterRowProps): JSX.Element {
  const { id, name, isDefault, isBuiltIn } = printer;
  const canSetDefault = !isDefault && !isBuiltIn;
  const canDelete = !isBuiltIn;
  return (
    <View testID={`printer-row-${id}`} className="gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium text-foreground">{name}</Text>
          {isDefault && (
            <Text testID={`printer-row-${id}-default`} className="rounded border border-border px-1.5 text-xs text-muted-foreground">
              Default
            </Text>
          )}
        </View>
        <Text testID={`printer-row-${id}-connection`} className="text-xs text-muted-foreground">{connectionLabel(printer)}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Button testID={`printer-row-${id}-test`} variant="outline" size="sm" disabled={testing} aria-busy={testing} onPress={() => onTest(printer)}>
          {testing ? <Loader size="sm" /> : null}
          <Text>Test Print</Text>
        </Button>
        {!isBuiltIn && (
          <Button testID={`printer-row-${id}-edit`} variant="outline" size="sm" onPress={() => onEdit(printer)}>
            <Text>Edit</Text>
          </Button>
        )}
        {/* v2 always shows the menu for its "Copy setup report"; without it a built-in printer's menu would be empty. */}
        {(canSetDefault || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton testID={`printer-row-${id}-menu`} size="sm" accessibilityLabel="More actions">
                <View className="text-foreground"><MoreIcon /></View>
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSetDefault && (
                <DropdownMenuItem testID={`printer-row-${id}-set-default`} onPress={() => onSetDefault(id)}>
                  <Text>Set Default</Text>
                </DropdownMenuItem>
              )}
              {canDelete && canSetDefault && <DropdownMenuSeparator />}
              {canDelete && (
                <DropdownMenuItem testID={`printer-row-${id}-delete`} onPress={() => onDelete(printer)}>
                  <Text className="text-destructive">Delete</Text>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </View>
    </View>
  );
}

export function PrintingSettings({
  printers, loading = false, testingIds = NO_TESTS, onTest, onEdit, onSetDefault, onDelete, onAdd, className,
}: PrintingSettingsProps): JSX.Element {
  // The dialog is open while `pending` is set; `target` outlives it so the title keeps the name while it closes.
  const [pending, setPending] = useState<PrinterProfile>();
  const [target, setTarget] = useState<PrinterProfile>();
  const hasHardware = printers.some((printer) => !isPrintDialog(printer));
  const askDelete = (printer: PrinterProfile) => {
    setTarget(printer);
    setPending(printer);
  };

  return (
    <View className={cn('gap-6', className)}>
      <SettingsGroup title="Printers" description="Devices receipts can be sent to.">
        {loading ? null : (
          <>
            {hasHardware ? printers.map((printer) => (
              <PrinterRow
                key={printer.id} printer={printer} testing={testingIds.has(printer.id)}
                onTest={onTest} onEdit={onEdit} onSetDefault={onSetDefault} onDelete={askDelete}
              />
            )) : (
              <View testID="printers-empty-state" className="gap-1 px-4 py-6">
                <Text className="text-center text-sm font-medium text-foreground">No printers configured</Text>
                <Text className="text-center text-sm text-muted-foreground">
                  Add a printer to send receipts straight to your hardware. You can always use the Print Dialog without one.
                </Text>
              </View>
            )}
            <View className="p-4">
              {/* Primary until a hardware printer exists, as in v2. */}
              <Button testID="printing-add-printer-button" variant={hasHardware ? 'outline' : 'default'} size="sm" className="self-start" onPress={onAdd}>
                <Text>Add Printer</Text>
              </Button>
            </View>
          </>
        )}
      </SettingsGroup>
      {/* No description: v2's "Receipts routed to it print with Auto instead." is about template routing, which TallyUI lacks. */}
      <ConfirmDialog
        testID={`printer-row-${target?.id}-delete-dialog`}
        cancelTestID={`printer-row-${target?.id}-delete-cancel`} confirmTestID={`printer-row-${target?.id}-delete-confirm`}
        title={`Delete ${target?.name ?? ''}?`} confirmLabel="Delete"
        open={pending !== undefined} onOpenChange={(open) => { if (!open) setPending(undefined); }}
        onConfirm={() => { if (pending) onDelete(pending.id); }}
      />
    </View>
  );
}
