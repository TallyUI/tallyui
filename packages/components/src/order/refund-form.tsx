import { useRef, useState, type JSX } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { formatMoney, type OrderRefundPayload } from '@tallyui/core';
import { priceRefund, refundableLines, type EarlierRefund, type RefundableOrderLine } from '@tallyui/pos';
import { QuantityStepper } from '../input/quantity-stepper';
import { parsePrice } from '../sale/price-form';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Text } from '../ui/text';

/** What the form hands back: the order.refund v1 payload minus the ids, session and clock the caller adds. */
export type RefundFormValue = Pick<OrderRefundPayload,
  'lines' | 'shippingMinor' | 'adjustmentMinor' | 'totalMinor' | 'destination' | 'reason'>;

export interface RefundFormProps {
  /** The order's lines; a StoreOrderLine fits. */
  lines: ReadonlyArray<RefundableOrderLine & { name: string }>;
  /** Earlier refunds' lines, subtracted by order line id. */
  refunds: readonly EarlierRefund[];
  currency: string;
  /** The order number the store shows, for the confirmation. */
  orderReference: string;
  /** The order total with tax. */
  orderTotalMinor: number;
  /** Money already refunded on the order, positive; default 0. */
  refundedMinor?: number;
  /** Shipping still refundable, with tax; 0 or absent hides the shipping field. */
  refundableShippingMinor?: number;
  /** The sale's payment method; omit for a cash sale, which always refunds in cash. */
  originalMethod?: { title: string; available: boolean };
  /** Each line's restock starting value; default true. */
  defaultRestock?: boolean;
  /** Refunds are online only (ADR-080); false disables confirming. Default true. */
  online?: boolean;
  /** A refusal from the caller's last attempt, shown above the actions. */
  error?: string;
  /** Called once per confirmation; the form stays busy until a returned promise settles. */
  onConfirm: (refund: RefundFormValue) => void | Promise<unknown>;
  onCancel: () => void;
}

function parseAmount(text: string, currency: string, signed = false): number | string {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const negative = signed && trimmed.startsWith('-');
  const parsed = parsePrice(negative ? trimmed.slice(1) : trimmed, currency);
  return negative && typeof parsed === 'number' && parsed !== 0 ? -parsed : parsed;
}

/** Ports WCPOS v2 form.tsx, monorepo main 5ac185b0e; the till never prices lines itself (priceRefund). */
export function RefundForm({
  lines, refunds, currency, orderReference, orderTotalMinor, refundedMinor = 0,
  refundableShippingMinor = 0, originalMethod, defaultRestock = true, online = true,
  error, onConfirm, onCancel,
}: RefundFormProps): JSX.Element {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [shippingText, setShippingText] = useState('');
  const [adjustmentText, setAdjustmentText] = useState('');
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<'original_method' | 'cash' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [thrown, setThrown] = useState('');
  const fmt = (amount: number) => formatMoney({ amount, currency }) ?? '';
  const available = refundableLines(lines, refunds);
  const request = available.map(({ orderLineId, refundableQuantity }) => ({
    orderLineId,
    quantity: Math.min(quantities[orderLineId] ?? 0, refundableQuantity),
    restock: restock[orderLineId] ?? defaultRestock,
  })).filter(({ quantity }) => quantity > 0);
  const priced = priceRefund(lines, refunds, request);
  const shippingMinor = refundableShippingMinor > 0 ? parseAmount(shippingText, currency) : 0;
  const adjustmentMinor = parseAmount(adjustmentText, currency, true);
  const totalMinor = typeof shippingMinor === 'number' && typeof adjustmentMinor === 'number'
    ? priced.totalMinor + shippingMinor + adjustmentMinor : undefined;
  const destination = originalMethod?.available ? (picked ?? 'original_method') : 'cash';
  const invalid = typeof shippingMinor === 'string' ? shippingMinor
    : typeof adjustmentMinor === 'string' ? adjustmentMinor
    : shippingMinor > refundableShippingMinor ? `Shipping can be at most ${fmt(refundableShippingMinor)}.`
    : priced.lines.length === 0 && shippingMinor === 0 && adjustmentMinor === 0 ? 'Choose something to refund.'
    : totalMinor! <= 0 ? 'The refund total must be more than 0.'
    : totalMinor! > orderTotalMinor - refundedMinor ? `You can refund at most ${fmt(orderTotalMinor - refundedMinor)}.`
    : reason.trim() === '' ? 'Enter a reason.' : null;
  const disabled = !!invalid || online === false || busy;
  const confirm = async () => {
    if (invalid || online === false || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setThrown('');
    // The parse errors above prevent confirmation until all three amounts are numbers.
    const value: RefundFormValue = {
      lines: priced.lines,
      shippingMinor: shippingMinor as number,
      adjustmentMinor: adjustmentMinor as number,
      totalMinor: totalMinor!,
      destination,
      reason: reason.trim(),
    };
    try {
      await onConfirm(value);
    } catch (e) {
      setThrown(String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <View testID="refund-form" className="flex-1 flex-col gap-4">
      <ScrollView className="flex-1" contentContainerClassName="gap-4">
        <View className="flex-row justify-between gap-2">
          <Text>Total</Text><Text testID="refund-order-total">{fmt(orderTotalMinor)}</Text>
        </View>
        {refundedMinor > 0 && <View className="flex-row justify-between gap-2">
          <Text>Previously Refunded</Text><Text testID="refund-previously-refunded">{fmt(-refundedMinor)}</Text>
        </View>}
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="flex-[3]">Product</Text><Text>Qty</Text><Text>Refund Qty</Text>
          <Text>Refund Amount</Text><Text>Restock</Text>
        </View>
        {lines.map(({ id, name }, index) => {
          const { refundableQuantity } = available[index];
          return <View key={id} testID={`refund-line-${id}`} className="flex-row flex-wrap items-center gap-2 border-b border-border py-2">
            <Text className="flex-[3]" numberOfLines={1}>{name}</Text>
            <Text testID={`refund-remaining-${id}`}>{refundableQuantity}</Text>
            <QuantityStepper testID={`refund-qty-${id}`} min={0} max={refundableQuantity}
              quantity={Math.min(quantities[id] ?? 0, refundableQuantity)}
              onChangeQuantity={(quantity) => setQuantities((current) => ({ ...current, [id]: quantity }))} />
            <Text testID={`refund-line-amount-${id}`}>{fmt(priced.priced.find((line) => line.orderLineId === id)?.totalMinor ?? 0)}</Text>
            <Checkbox testID={`refund-restock-${id}`} accessibilityLabel={`Restock ${name}`}
              checked={restock[id] ?? defaultRestock}
              onCheckedChange={(checked) => setRestock((current) => ({ ...current, [id]: checked }))} />
          </View>;
        })}
        {refundableShippingMinor > 0 && <View className="gap-2">
          <Label nativeID="refund-shipping-label">Shipping</Label>
          <Input><Input.Field testID="refund-shipping" accessibilityLabel="Shipping"
            accessibilityLabelledBy="refund-shipping-label" keyboardType="decimal-pad" placeholder={fmt(0)}
            value={shippingText} onChangeText={setShippingText} /></Input>
          <Text className="text-muted-foreground">{`Up to ${fmt(refundableShippingMinor)}`}</Text>
        </View>}
        <View className="gap-2">
          <Label nativeID="refund-adjustment-label">Adjustment</Label>
          <Input><Input.Field testID="refund-adjustment" accessibilityLabel="Adjustment"
            accessibilityLabelledBy="refund-adjustment-label" placeholder={fmt(0)}
            value={adjustmentText} onChangeText={setAdjustmentText} /></Input>
          <Text className="text-muted-foreground">A minus sign takes the amount off the refund.</Text>
        </View>
        <View className="gap-2">
          <Label nativeID="refund-reason-label">Reason</Label>
          <Input><Input.Field testID="refund-reason" accessibilityLabel="Reason"
            accessibilityLabelledBy="refund-reason-label" placeholder="Reason for refund" maxLength={500}
            value={reason} onChangeText={setReason} /></Input>
        </View>
        {originalMethod && <View className="gap-2">
          <Text>Refund destination</Text>
          <View className="flex-row flex-wrap gap-2">
            {(['original_method', 'cash'] as const).map((option) => <Pressable key={option}
              testID={`refund-destination-${option}`} accessibilityRole="button"
              accessibilityState={{ selected: destination === option }} aria-selected={destination === option}
              disabled={option === 'original_method' && !originalMethod.available} onPress={() => setPicked(option)}
              className={`rounded-md border border-border px-3 py-2 min-h-11 ${destination === option ? 'bg-primary' : 'bg-card'}`}>
              <Text className={destination === option ? 'text-primary-foreground' : 'text-foreground'}>
                {option === 'original_method' ? `Refund to ${originalMethod.title}` : 'Refund via cash'}
              </Text>
            </Pressable>)}
          </View>
          {!originalMethod.available && <Text className="text-muted-foreground">
            Original payment method refunds are unavailable for this order.
          </Text>}
        </View>}
        <View className="flex-row justify-between gap-2">
          <Text className="font-semibold">Refund Total</Text>
          <Text testID="refund-total" className="font-semibold">{fmt(totalMinor ?? 0)}</Text>
        </View>
      </ScrollView>
      {online === false && <Text testID="refund-offline-reason" className="text-muted-foreground">Refunds need a connection</Text>}
      {invalid && online !== false && <Text testID="refund-invalid" className="text-muted-foreground">{invalid}</Text>}
      {!!(error ?? thrown) && <Text testID="refund-error" className="text-destructive">{error ?? thrown}</Text>}
      {!confirming ? <View className="flex-row gap-2">
        <Button testID="refund-cancel" variant="outline" onPress={onCancel}><Text>Cancel</Text></Button>
        <Button testID="refund-submit" disabled={disabled} onPress={() => setConfirming(true)}>
          <Text>{disabled ? 'Process Refund'
            : `Refund ${fmt(totalMinor ?? 0)} ${destination === 'cash' ? 'in cash' : 'to the original method'}`}</Text>
        </Button>
      </View> : <>
        <Text className="font-semibold">Confirm Refund</Text>
        <Text testID="refund-confirm-text">{`Refund ${fmt(totalMinor ?? 0)} for Order #${orderReference}?`}</Text>
        <View className="flex-row gap-2">
          <Button testID="refund-confirm" variant="destructive" disabled={disabled} onPress={confirm}>
            <Text>{busy ? 'Refunding…' : 'Process Refund'}</Text>
          </Button>
          <Button testID="refund-confirm-cancel" variant="outline" onPress={() => setConfirming(false)}><Text>Cancel</Text></Button>
        </View>
      </>}
    </View>
  );
}
