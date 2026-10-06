import { useEffect, useState, type JSX } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import type { RxCollection } from 'rxdb';
import { formatMoney } from '@tallyui/core';
import { parkedOrderSummaries$, type ParkedOrderSummary, type useSale } from '@tallyui/pos';
import { Button } from '../ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog';
import { IconButton } from '../ui/icon-button';
import { XIcon } from '../ui/icon/x-icon';
import { Text } from '../ui/text';
import { formatStockSyncTime } from './catalogue';

export interface ParkedSalesProps {
  sale: ReturnType<typeof useSale>;
  drafts: RxCollection;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hour12?: boolean;
}

export function ParkedSales({ sale, drafts, currency, open, onOpenChange, hour12 }: ParkedSalesProps): JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = Math.max(280, windowHeight - 64);
  const [rows, setRows] = useState<ParkedOrderSummary[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const subscription = parkedOrderSummaries$(drafts).subscribe((summaries) => {
      setRows([...summaries].sort((a, b) => b.parkedAt.localeCompare(a.parkedAt)));
    });
    return () => subscription.unsubscribe();
  }, [drafts]);

  const attempt = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent testID="parked-sales" className="flex-col overflow-hidden" style={{ maxHeight }}>
        <View className="flex-row items-center justify-between gap-2">
          <DialogTitle>Parked sales</DialogTitle>
          <DialogClose asChild>
            <IconButton variant="ghost" size="sm" testID="parked-sales-dismiss" accessibilityLabel="Close panel">
              <XIcon size={16} />
            </IconButton>
          </DialogClose>
        </View>
        <ScrollView className="flex-1" contentContainerClassName="gap-3">
          <Button testID="parked-sales-park" accessibilityLabel="Park this sale"
            disabled={sale.order.lineItems.length === 0}
            onPress={() => attempt(async () => setError((await sale.park()) ?? ''))}>
            <Text>Park this sale</Text>
          </Button>
          {!!error && <Text testID="parked-sales-error" className="text-destructive">{error}</Text>}
          {rows.length === 0 && <Text testID="parked-sales-empty">No parked sales.</Text>}
          {rows.map((row) => (
            <View key={row.id} testID={`parked-row-${row.id}`} className="gap-2 rounded-md border border-border p-3">
              {confirming === row.id ? (
                <>
                  <Text>Discard this parked sale?</Text>
                  <View className="flex-row gap-2">
                    <Button testID={`parked-discard-confirm-${row.id}`} variant="destructive"
                      onPress={() => attempt(async () => {
                        await (await drafts.findOne(row.id).exec())?.remove();
                        setConfirming(null);
                      })}>
                      <Text>Discard</Text>
                    </Button>
                    <Button testID={`parked-discard-cancel-${row.id}`} variant="outline" onPress={() => setConfirming(null)}>
                      <Text>Cancel</Text>
                    </Button>
                  </View>
                </>
              ) : (
                <>
                  <Text>{formatStockSyncTime(new Date(row.parkedAt), undefined, hour12)}</Text>
                  <Text>{row.itemCount} {row.itemCount === 1 ? 'item' : 'items'}</Text>
                  <Text>{formatMoney({ amount: row.totalMinor, currency })}</Text>
                  {!!row.customerName && <Text>{row.customerName}</Text>}
                  <View className="flex-row gap-2">
                    <Button testID={`parked-resume-${row.id}`} accessibilityLabel="Resume parked sale"
                      onPress={() => attempt(async () => {
                        const refusal = await sale.resume(row.id);
                        if (refusal === null) onOpenChange(false);
                        else setError(refusal);
                      })}>
                      <Text>Resume</Text>
                    </Button>
                    <Button testID={`parked-discard-${row.id}`} accessibilityLabel="Discard parked sale"
                      variant="outline" onPress={() => setConfirming(row.id)}>
                      <Text>Discard</Text>
                    </Button>
                  </View>
                </>
              )}
            </View>
          ))}
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
}
