import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, Text } from '@tallyui/components';
import { createBroadcastDisplayTransport, createDisplayLink, type DisplayConfig, type DisplayLink, type ReceiptData } from '@tallyui/pos';

// Shortened from v2's 8 s so the demo (and its e2e test) does not wait long for idle.
const config: DisplayConfig = {
  contract: '1.0', display: { id: 'demo', name: 'Demo display' },
  store: { id: 'demo', name: 'Tally Demo Store', currency: 'EUR', locale: 'en-IE' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 3000 },
};
const products = { Tea: 250, Cake: 400 };
type Lines = Partial<Record<keyof typeof products, number>>;

function receiptOf(lines: Lines, paidMinor = 0): ReceiptData {
  const lineItems = Object.entries(lines).map(([name, quantity]) => {
    const unitPriceMinor = products[name as keyof typeof products];
    return { name, sku: '', quantity: quantity!, unitPriceMinor, lineTotalMinor: unitPriceMinor * quantity!,
      displayAmountMinor: unitPriceMinor * quantity!, displayDiscounts: [] };
  });
  const totalMinor = lineItems.reduce((sum, line) => sum + line.displayAmountMinor, 0);
  return {
    schemaVersion: '1.4.0', software: { name: 'TallyUI', plugin_version: '', app_version: '', app_build: '', platform: 'web' },
    register: { id: '', name: '' }, fiscal: { document_type: 'sale', is_reprint: false, reprint_count: 0, qr_payload: '' },
    header: { storeName: config.store.name, orderNumber: 'demo', date: new Date().toISOString() },
    lineItems, fees: [], shipping: [], discounts: [], orderDiscountMinor: 0,
    totals: { taxInclusive: true, subtotalMinor: totalMinor, discountMinor: 0, taxLines: [], taxMinor: 0, totalMinor },
    payments: paidMinor ? [{ method: 'cash', amountMinor: paidMinor }] : [], changeDueMinor: Math.max(0, paidMinor - totalMinor),
    footer: {}, currency: config.store.currency,
  };
}

/** The till's half of the same-device customer display; the other half is the `/customer-display` route. */
export default function CustomerDisplayTill() {
  const [link, setLink] = useState<DisplayLink | null>(null);
  const [lines, setLines] = useState<Lines>({});
  useEffect(() => {
    const transport = createBroadcastDisplayTransport();
    const created = createDisplayLink(transport, { config });
    setLink(created);
    return () => {
      created.close();
      transport.close();
    };
  }, []);
  useEffect(() => link?.showCart(receiptOf(lines)), [link, lines]);
  const add = (name: keyof typeof products) => setLines((current) => ({ ...current, [name]: (current[name] ?? 0) + 1 }));
  const complete = () => {
    const receipt = receiptOf(lines, Math.ceil(receiptOf(lines).totals.totalMinor / 1000) * 1000);
    link?.showPayment(receipt, { state: 'complete', leg: { method: 'Cash', amountMinor: receipt.payments[0]?.amountMinor ?? 0 } });
    setLines({});
  };
  return <>
    <Stack.Screen options={{ title: 'Customer display' }} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-3">
      <Text>Open the display, then drive it from here. Both windows must be on this device and origin.</Text>
      <Button onPress={() => window.open('/customer-display', 'tally-customer-display')}><Text>Open customer display</Text></Button>
      <View className="flex-row flex-wrap gap-3">
        <Button variant="outline" onPress={() => add('Tea')}><Text>Add Tea</Text></Button>
        <Button variant="outline" onPress={() => add('Cake')}><Text>Add Cake</Text></Button>
        <Button variant="outline" onPress={() => link?.showPayment(receiptOf(lines), { state: 'started' })}><Text>Take payment</Text></Button>
        <Button variant="outline" onPress={complete}><Text>Complete payment</Text></Button>
        <Button variant="outline" onPress={() => setLines({})}><Text>Clear cart</Text></Button>
      </View>
    </ScrollView>
  </>;
}
