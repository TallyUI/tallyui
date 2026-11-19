import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PrintingSettings } from '@tallyui/components';
import type { PrinterProfile } from '@tallyui/pos';

const PRINT_DIALOG: PrinterProfile = { id: 'print-dialog', name: 'Print Dialog', connectionType: 'system', isBuiltIn: true, isDefault: true };
const HARDWARE: PrinterProfile[] = [
  { id: 'front-counter', name: 'Front counter', connectionType: 'network', vendor: 'epson', address: '192.168.1.40', port: 9100 },
  { id: 'kitchen', name: 'Kitchen', connectionType: 'bluetooth', address: '00:11:62:AA:BB:CC' },
];
const TEMPLATES = [
  { id: 'thermal-80', kind: 'receipt', title: 'Thermal receipt', engine: 'thermal', paper: '80mm' },
  { id: 'html-receipt', kind: 'receipt', title: 'Standard receipt', engine: 'html' },
  { id: 'z-report', kind: 'report', title: 'Z report', engine: 'thermal', paper: '58mm' },
  { id: 'closure', kind: 'closure', title: 'Register closure', engine: 'html' },
] as const;

// The app passes its `printer_profiles` and opens its own add/edit dialog; the demo keeps the printers in state.
// `?empty=1` shows only the Print Dialog (the empty state).
export default function PrintingSettingsScreen() {
  const { empty } = useLocalSearchParams<{ empty?: string }>();
  const [printers, setPrinters] = useState<PrinterProfile[]>(() => (empty === '1' ? [PRINT_DIALOG] : [PRINT_DIALOG, ...HARDWARE]));
  const [testingIds, setTestingIds] = useState<ReadonlySet<string>>(new Set());
  // 'gone' names no printer, so the Standard receipt row shows "Unavailable printer".
  const [routing, setRouting] = useState<Record<string, string>>({ 'html-receipt': 'gone' });
  const onRoutingChange = (templateId: string, printerId: string | null) => setRouting((current) => {
    const next = { ...current };
    if (printerId === null) delete next[templateId];
    else next[templateId] = printerId;
    return next;
  });

  const onTest = (printer: PrinterProfile) => {
    setTestingIds((ids) => new Set(ids).add(printer.id));
    setTimeout(() => setTestingIds((ids) => new Set([...ids].filter((id) => id !== printer.id))), 1500);
  };
  const onSetDefault = (id: string) => setPrinters((list) => list.map((p) => ({ ...p, isDefault: p.id === id })));
  const onDelete = (id: string) => setPrinters((list) => list.filter((p) => p.id !== id));
  const onAdd = () => setPrinters((list) => [
    ...list, { id: `printer-${list.length}`, name: `Printer ${list.length}`, connectionType: 'network', address: '192.168.1.50' },
  ]);

  return (
    <>
      <Stack.Screen options={{ title: 'PrintingSettings' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4">
        <PrintingSettings
          printers={printers} testingIds={testingIds}
          onTest={onTest} onEdit={() => undefined} onSetDefault={onSetDefault} onDelete={onDelete} onAdd={onAdd}
          templates={TEMPLATES} routing={routing} onRoutingChange={onRoutingChange}
        />
      </ScrollView>
    </>
  );
}
