// Tap targets (44 px under a coarse pointer): the phone till from top to bottom. The catalogue
// header mirrors `packages/components/src/sale/catalogue.tsx` (its search row, status row and
// horizontal CategoryNav), so the e2e spec measures each control inside the strips it sits in. The search
// row mirrors catalogue's coarse-pointer minHeight (the band's height), computed here from public exports.
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  CameraScanButton, CategoryNav, Input, RegisterBar, ScaleProvider, Tabs, TabsList, TabsTrigger, Text, ViewToggle,
  usePointer, useScale,
} from '@tallyui/components';
import { openSession, type CatalogueView } from '@tallyui/pos';
import { POINTER_FLOORS, type ScaleStep } from '@tallyui/theme';
import { useDemoRegister, type DemoRegisterDb } from '../../lib/use-demo-register';

const CATEGORIES = [
  { id: '', name: 'All products' },
  { id: 'coffee', name: 'Coffee' },
  { id: 'tea', name: 'Tea' },
  { id: 'equipment', name: 'Equipment' },
  { id: 'snacks', name: 'Snacks' },
];

async function seed(db: DemoRegisterDb) {
  await openSession(db.register_sessions, {
    registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
    openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
  });
}

// Rendered inside the ScaleProvider, so the hooks read the `?scale=` step rather than the provider's default.
function SearchRow({ children }: { children: ReactNode }) {
  const band = Math.max(useScale().variables['--spacing-ctl'], POINTER_FLOORS.coarse);
  const coarse = usePointer() === 'coarse';
  return <View className="flex-row items-center gap-2" style={coarse ? { minHeight: band } : undefined}>{children}</View>;
}

export default function TapTargetsScreen() {
  const { scale: param } = useLocalSearchParams<{ scale?: string }>();
  const scale: ScaleStep | undefined = param === 'compact' || param === 'regular' ? param : undefined;
  const { register, ready } = useDemoRegister({ seed });
  const [tab, setTab] = useState('products');
  const [view, setView] = useState<CatalogueView>('grid');
  const [category, setCategory] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <ScaleProvider scale={scale}>
      <Stack.Screen options={{ title: 'Tap targets' }} />
      <View className="flex-1 bg-background" testID="tap-targets-screen">
        {ready && (
          <RegisterBar register={register} registerId="demo-register" online registerName="Front counter"
            multiRegister storeName="Demo store" onOpenPanel={() => {}} onOpenMenu={() => {}} />
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="m-2 flex-row">
            <TabsTrigger value="products" testID="tab-products" className="flex-1"><Text>Products</Text></TabsTrigger>
            <TabsTrigger value="cart" testID="tab-cart" className="flex-1"><Text>Cart</Text></TabsTrigger>
          </TabsList>
        </Tabs>
        <View className="gap-2 border-b border-border bg-card px-4 pb-3 pt-3">
          <SearchRow>
            <View className="flex-1">
              <Input><Input.Field placeholder="Search or scan barcode / SKU" /></Input>
            </View>
            <CameraScanButton open={scannerOpen} onPress={() => setScannerOpen((open) => !open)} />
          </SearchRow>
          <View testID="catalogue-status-row" className="flex-row items-center gap-2">
            <Text className="flex-1 text-xs text-muted-foreground">24 products</Text>
            <ViewToggle value={view} onChange={setView} />
          </View>
          <CategoryNav categories={CATEGORIES} selectedId={category} onSelect={setCategory} />
        </View>
        <View className="flex-1" />
      </View>
    </ScaleProvider>
  );
}
