import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Button, ReceiptPreview, ReceiptSheet, Text, type ReceiptSheetTemplate } from '@tallyui/components';

const TEMPLATES: ReceiptSheetTemplate[] = [
  { id: 'receipt', title: 'Receipt' },
  { id: 'gift', title: 'Gift receipt' },
  { id: 'kitchen', title: 'Kitchen ticket', disabled: true },
];

const ITEMS = [
  { name: 'Espresso', quantity: 2, total: '€5.00' },
  { name: 'Croissant', quantity: 1, total: '€3.20' },
  { name: 'Orange juice', quantity: 1, total: '€4.50' },
];

/** `?open=1` opens the sheet on load and `?one=1` passes only the first template, for the screenshots. */
export default function ReceiptSheetScreen() {
  const params = useLocalSearchParams<{ open?: string; one?: string }>();
  const [open, setOpen] = useState(params.open === '1');
  const [templateId, setTemplateId] = useState('receipt');
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onPrint = () => {
    setPrinting(true);
    timer.current = setTimeout(() => { setPrinting(false); setPrinted(true); }, 1000);
  };

  return (
    <View className="flex-1 items-start bg-background p-4" testID="receipt-sheet-screen">
      <Stack.Screen options={{ title: 'ReceiptSheet' }} />
      <Button testID="receipt-sheet-open" onPress={() => setOpen(true)}><Text>Show receipt</Text></Button>
      <ReceiptSheet open={open} onOpenChange={setOpen} templates={params.one === '1' ? TEMPLATES.slice(0, 1) : TEMPLATES}
        templateId={templateId} onTemplateChange={setTemplateId} onPrint={onPrint} printing={printing} printed={printed}
        onEmail={() => {}}>
        <ReceiptPreview items={ITEMS} subtotal="€12.70" tax="€3.18" total="€15.88"
          headerSlot={<Text className="text-sm font-semibold text-foreground">Demo Café</Text>} />
      </ReceiptSheet>
    </View>
  );
}
