/**
 * Settings › Printing, the Printers section and template routing: ported from WCPOS v2
 * `packages/core/src/screens/main/settings/printing/` (`index.tsx`, `printer-row.tsx`, `template-row.tsx`). Props only;
 * the app passes the printers and wires every callback, and opens its own add/edit dialog from `onAdd` / `onEdit` and
 * shows the result of `onTest`. The setup report and docs link are optional (`onCopySetupReport`, `onOpenHelp`);
 * the app does the copying, the toast and opening the docs. Left out (a later row): the test-print toast.
 */
import { useState, type JSX } from 'react';
import { View } from 'react-native';
import { Circle } from 'react-native-svg';
import type { ReceiptTemplate } from '@tallyui/core';
import { resolvePrinter, type PrinterProfile } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { createSvgIcon } from '../ui/icon/svg-icon';
import { IconButton } from '../ui/icon-button';
import { Loader } from '../ui/loader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Text } from '../ui/text';
import { SettingsGroup } from './settings-group';

type RoutedTemplate = Pick<ReceiptTemplate, 'id' | 'kind' | 'title' | 'engine' | 'paper'>;

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
  /** The store's templates, in its order. When absent, no routing sections are drawn. */
  templates?: readonly RoutedTemplate[];
  /** Template id -> printer profile id: this device's overrides. Default `{}`. */
  routing?: Readonly<Record<string, string>>;
  /** A template's printer was chosen; `null` means Auto (clear the override). */
  onRoutingChange?: (templateId: string, printerId: string | null) => void;
  /** v2's "Copy setup report": adds that item, first in each printer row's menu, and makes the menu show for every row. The app builds
   * and copies the report (clipboard or share sheet) and shows any toast; the component only calls this. */
  onCopySetupReport?: (printer: PrinterProfile) => void;
  /** v2's "Having trouble?" link under the printer list; pressing it calls this (the app opens its printer docs). Absent: no link. */
  onOpenHelp?: () => void;
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

interface PrinterRowProps extends Pick<PrintingSettingsProps, 'onTest' | 'onEdit' | 'onSetDefault' | 'onCopySetupReport'> {
  printer: PrinterProfile;
  testing: boolean;
  onDelete: (printer: PrinterProfile) => void;
}

function PrinterRow({ printer, testing, onTest, onEdit, onSetDefault, onDelete, onCopySetupReport }: PrinterRowProps): JSX.Element {
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
        {/* Without onCopySetupReport a built-in printer's menu would be empty, so the menu shows only with an item. */}
        {(canSetDefault || canDelete || onCopySetupReport) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton testID={`printer-row-${id}-menu`} size="sm" accessibilityLabel="More actions">
                <View className="text-foreground"><MoreIcon /></View>
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCopySetupReport && (
                <DropdownMenuItem testID={`printer-row-${id}-copy-report`} onPress={() => onCopySetupReport(printer)}>
                  <Text>Copy setup report</Text>
                </DropdownMenuItem>
              )}
              {canSetDefault && (
                <DropdownMenuItem testID={`printer-row-${id}-set-default`} onPress={() => onSetDefault(id)}>
                  <Text>Set Default</Text>
                </DropdownMenuItem>
              )}
              {canDelete && (canSetDefault || onCopySetupReport) && <DropdownMenuSeparator />}
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

// v2's AUTO_VALUE: the Select value that means "no override".
const AUTO = '__auto__';
const NO_ROUTING: Readonly<Record<string, string>> = {};
const SECTIONS = [
  { kind: 'receipt', title: 'Receipt Templates' },
  { kind: 'report', title: 'Report templates' },
  { kind: 'closure', title: 'Closure templates' },
] as const;

interface TemplateRowProps extends Pick<PrintingSettingsProps, 'printers' | 'onRoutingChange'> {
  template: RoutedTemplate;
  overrideId: string | undefined;
}

function TemplateRow({ template, printers, overrideId, onRoutingChange }: TemplateRowProps): JSX.Element {
  const { id, title, engine, paper } = template;
  const autoLabel = `Auto — ${resolvePrinter({ template, profiles: printers })?.name ?? 'Print Dialog'}`;
  const override = overrideId ? printers.find((printer) => printer.id === overrideId) : undefined;
  const missing = overrideId !== undefined && !override;
  const selected = override
    ? { value: override.id, label: override.name }
    : missing ? { value: overrideId, label: 'Unavailable printer' } : { value: AUTO, label: autoLabel };
  // v2 shows a bare "Thermal"; an unset paper is 80mm because resolvePrinter/templateColumns and renderReceiptHtml treat it so.
  const typeLabel = engine === 'thermal' ? `Thermal ${paper ?? '80mm'}` : 'HTML';
  return (
    <View testID={`template-row-${id}`} className="gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <View className="flex-1 flex-row items-center gap-2">
        <Text className="text-sm font-medium text-foreground">{title}</Text>
        <Text testID={`template-row-${id}-type`} className="rounded border border-border px-1.5 text-xs text-muted-foreground">
          {typeLabel}
        </Text>
      </View>
      <Select value={selected}
        onValueChange={(option) => { if (option) onRoutingChange?.(id, option.value === AUTO ? null : option.value); }}>
        <SelectTrigger testID={`template-row-${id}-printer-select`} accessibilityLabel={`Printer for ${title}`} className="h-9 w-64">
          <SelectValue placeholder={autoLabel} className="shrink text-sm text-foreground" numberOfLines={1} />
        </SelectTrigger>
        <SelectContent className="w-64">
          <SelectItem value={AUTO} label={autoLabel}><Text className="text-sm">{autoLabel}</Text></SelectItem>
          {missing && (
            <SelectItem value={overrideId} label="Unavailable printer"><Text className="text-sm">Unavailable printer</Text></SelectItem>
          )}
          {printers.map((printer) => (
            <SelectItem key={printer.id} value={printer.id} label={printer.name}><Text className="text-sm">{printer.name}</Text></SelectItem>
          ))}
        </SelectContent>
      </Select>
    </View>
  );
}

export function PrintingSettings({
  printers, loading = false, testingIds = NO_TESTS, onTest, onEdit, onSetDefault, onDelete, onAdd,
  templates, routing = NO_ROUTING, onRoutingChange, onCopySetupReport, onOpenHelp, className,
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
                onCopySetupReport={onCopySetupReport}
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
            {onOpenHelp ? (
              <View className="px-4 pb-4">
                <Button testID="printing-having-trouble" variant="link" size="sm" role="link" className="h-11 self-start px-0"
                  onPress={onOpenHelp}>
                  <Text className="text-xs">Having trouble?</Text>
                </Button>
              </View>
            ) : null}
          </>
        )}
      </SettingsGroup>
      {templates && !loading && SECTIONS.map(({ kind, title }) => {
        const rows = templates.filter((template) => template.kind === kind);
        return (
          <SettingsGroup key={kind} title={title} description="Choose which printer each template prints to.">
            {rows.length > 0 ? rows.map((template) => (
              <TemplateRow key={template.id} template={template} printers={printers}
                overrideId={routing[template.id]} onRoutingChange={onRoutingChange} />
            )) : (
              <Text testID={`templates-empty-${kind}`} className="px-4 py-3 text-sm text-muted-foreground">No active templates found.</Text>
            )}
          </SettingsGroup>
        );
      })}
      {/* v2's description, shown only with routing: without `templates` no template is routed to a printer. */}
      <ConfirmDialog
        testID={`printer-row-${target?.id}-delete-dialog`}
        cancelTestID={`printer-row-${target?.id}-delete-cancel`} confirmTestID={`printer-row-${target?.id}-delete-confirm`}
        title={`Delete ${target?.name ?? ''}?`} confirmLabel="Delete"
        description={templates ? 'Receipts routed to it print with Auto instead.' : undefined}
        open={pending !== undefined} onOpenChange={(open) => { if (!open) setPending(undefined); }}
        onConfirm={() => { if (pending) onDelete(pending.id); }}
      />
    </View>
  );
}
