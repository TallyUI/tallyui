import { useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle, PrinterForm, PrintingSettings } from '@tallyui/components';
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
  const { height } = useWindowDimensions();
  const { empty } = useLocalSearchParams<{ empty?: string }>();
  const [printers, setPrinters] = useState<PrinterProfile[]>(() => (empty === '1' ? [PRINT_DIALOG] : [PRINT_DIALOG, ...HARDWARE]));
  const [testingIds, setTestingIds] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<PrinterProfile | 'new' | null>(null);
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
  const onAdd = () => setEditing('new');

  return (
    <>
      <Stack.Screen options={{ title: 'PrintingSettings' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4">
        <PrintingSettings
          printers={printers} testingIds={testingIds}
          onTest={onTest} onEdit={setEditing} onSetDefault={onSetDefault} onDelete={onDelete} onAdd={onAdd}
          templates={TEMPLATES} routing={routing} onRoutingChange={onRoutingChange}
        />
      </ScrollView>
      {/* The form scrolls inside the dialog on short screens, as the address editor in customer-dropdown. */}
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent testID="printer-form-dialog" className="flex-col overflow-hidden" style={{ maxHeight: Math.max(280, height - 64) }}>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add Printer' : 'Edit Printer'}</DialogTitle></DialogHeader>
          <ScrollView className="flex-1" testID="printer-form-body">{editing !== null && (
            <PrinterForm key={editing === 'new' ? 'new' : editing.id} printer={editing === 'new' ? undefined : editing}
              onCancel={() => setEditing(null)} onSave={(draft) => {
                setPrinters((list) => {
                  const id = editing === 'new' ? `printer-${list.length}` : editing.id;
                  const next = editing === 'new' ? [...list, { id, ...draft }]
                    : list.map((printer) => printer.id === id ? { id, ...draft } : printer);
                  return draft.isDefault ? next.map((printer) => printer.id === id ? printer : { ...printer, isDefault: false }) : next;
                });
                setEditing(null);
                return null;
              }} />
          )}</ScrollView>
        </DialogContent>
      </Dialog>
    </>
  );
}
