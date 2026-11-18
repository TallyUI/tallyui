// The split sale screen (parity S3a): v2's checkout column (pos-columns.tsx:118-162). At tender the checkout pane takes
// the products column's place and the cart stays beside it as the Payments ledger; on a phone the pane is the whole
// body, with its own ledger.
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Cart, Catalogue, POSLayout, Receipt, Tender } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { ConnectorProvider, type StoreSettings } from '@tallyui/core';
import { TaxProvider, taxProviderProps, useSale } from '@tallyui/pos';

const traits = medusaConnector.traits.product;
const settings: StoreSettings = {
  currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, 'reduced-rate': 100000 },
};
const products = [
  { id: 'shirt', title: 'Shirt', status: 'published', variants: [{ id: 'shirt-blue', title: 'Blue', sku: 'SHIRT', prices: [{ amount: 12.5, currency_code: 'eur' }] }] },
  { id: 'mug', title: 'Mug', status: 'published', variants: [{ id: 'mug-white', title: 'White', sku: 'MUG', prices: [{ amount: 8, currency_code: 'eur' }] }] },
];

function Sale() {
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', capabilities: { orderCreate: 5, lineTax: { none: true, classes: true } } });
  const { stage } = sale;
  const renderCheckout = stage.kind === 'tender'
    ? (layout: 'split' | 'stacked') => <ScrollView className="flex-1"><Tender sale={sale} ledger={layout === 'stacked'} /></ScrollView>
    : stage.kind === 'receipt'
      ? () => <ScrollView testID="sale-receipt" className="flex-1">
        <Receipt order={stage.order} posOrder={stage.posOrder} store={{ name: 'Demo store' }} cashier="Demo cashier"
          registerId="demo-register" newSale={sale.newSale} />
      </ScrollView>
      : undefined;
  const cart = stage.kind === 'tender'
    ? <Cart sale={sale} showTotal={false} tenderLedger={{}} />
    : <Cart sale={sale} showTotal={false} checkout={{ onCheckout: () => sale.startTender('cash') }} />;
  return <>
    <Stack.Screen options={{ title: 'Split sale' }} />
    <POSLayout cartSlot={cart} renderCheckout={renderCheckout}
      browseSlot={<Catalogue products={products} traits={traits} currency="EUR" lastSyncedAt={null} statusText="2 products"
        onSelect={(entry) => sale.add(entry, traits)} cartLines={sale.order.lineItems} />} />
  </>;
}

export default function SplitSaleScreen() {
  return (
    <ConnectorProvider connector={medusaConnector}>
      <TaxProvider {...taxProviderProps(settings)}>
        <Sale />
      </TaxProvider>
    </ConnectorProvider>
  );
}
