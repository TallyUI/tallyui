import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatMoney, useFormatMoney, minorUnitDigits, moneyFromDecimalString, type Money } from '@tallyui/core';
import type { AppliedDiscount, Discount } from '@tallyui/pos';
import { DiscountBadge } from '../cart';
import { DialogFooter } from '../ui/dialog';
import { IconButton } from '../ui/icon-button';
import { PlusIcon } from '../ui/icon/plus-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '../ui/combobox';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

/** The cashier's entry as a TallyUI Discount (a percent, or integer minor units), or the inline error to show. */
export function parseDiscount(type: Discount['type'], text: string, currency: string): Discount | string {
  // A comma-locale keypad (inputMode="decimal") types "1,50": a single comma is the decimal separator.
  const raw = text.trim();
  const trimmed = raw.split(',').length === 2 ? raw.replace(',', '.') : raw;
  if (!trimmed) return 'Enter a discount.';
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 'Enter a number.';
  const value = Number(trimmed);
  if (value <= 0) return 'Enter a discount above 0.';
  // Percentages take 2 decimals; a fixed amount takes the currency's own exponent.
  // "1,000" or "1.000" with more digits than allowed is refused, never read as 1.
  const digits = type === 'percentage' ? 2 : minorUnitDigits(currency);
  if ((trimmed.split('.')[1]?.length ?? 0) > digits) return digits ? `Use at most ${digits} decimal places.` : 'Use a whole amount.';
  if (type === 'percentage') return value > 100 ? 'A percentage can be at most 100.' : { type, value };
  const money = moneyFromDecimalString(trimmed, currency);
  return money ? { type, value: money.amount } : 'Enter a number.';
}

/** "10%", or a fixed discount's amount as it actually comes off (amountMinor), never the amount requested. */
export const discountLabel = (discount: AppliedDiscount, currency: string, format: (money: Money) => string | undefined = formatMoney) => discount.type === 'percentage'
  ? `${discount.value}%` : format({ amount: discount.amountMinor, currency }) ?? String(discount.amountMinor);

const button = 'rounded-md border border-border px-3 py-2 min-h-11 items-center justify-center';

/** One of the store's coupons, already formatted by the app (v2 add-coupon.tsx:233-286). */
export type DiscountCoupon = { code: string; detail?: string; amountLabel?: string };

const FAILED_COUPON = 'Failed to apply coupon.'; // v2 core.json:1119, also v2's fallback for an empty refusal.

/** v2 add-coupon.tsx: pick one of the app's coupons, Apply through the app; a refusal stays inline and the dialog open. */
function CouponTab({ coupons, onApplyCoupon, onClose, onNewCoupon, newCouponDisabledReason }: {
  coupons: readonly DiscountCoupon[]; onApplyCoupon: (code: string) => Promise<string | null>; onClose: () => void;
  onNewCoupon?: () => void; newCouponDisabledReason?: string;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const needle = search.trim().toLowerCase();
  const shown = needle ? coupons.filter((c) => [c.code, c.detail ?? ''].some((s) => s.toLowerCase().includes(needle))) : coupons;
  async function apply() {
    if (picked === null || applying) return;
    setApplying(true); setError(null);
    let refused: string | null;
    try { refused = await onApplyCoupon(picked); } catch { refused = FAILED_COUPON; }
    setApplying(false);
    if (refused === null) onClose(); else setError(refused || FAILED_COUPON);
  }
  return <>
    {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    <View className="flex-row items-center gap-2"><Text className="text-foreground">Coupon</Text>
      <View className="flex-1">
        <Combobox value={picked === null ? undefined : { value: picked, label: picked }} searchValue={search}
          onValueChange={(next) => { setPicked(next?.value ?? null); setError(null); }}
          onSearchValueChange={(text) => { setSearch(text); setError(null); }}>
          <ComboboxTrigger testID="add-coupon-combobox"><Text className={picked === null ? 'text-muted-foreground' : 'text-foreground'}>
            {picked ?? 'Select coupon...'}</Text></ComboboxTrigger>
          <ComboboxContent>
            <View className="border-b border-border px-2 py-1.5"><ComboboxInput testID="add-coupon-search-input" placeholder="Search coupons..." /></View>
            <ComboboxList>
              {shown.map((coupon) => <ComboboxItem key={coupon.code} testID={`add-coupon-option-${coupon.code}`} value={coupon.code} label={coupon.code}>
                <View className="flex-1 flex-row items-center justify-between gap-2">
                  <View className="flex-1 gap-0.5">
                    <Text className="text-sm font-medium text-popover-foreground">{coupon.code}</Text>
                    {coupon.detail ? <Text numberOfLines={1} className="text-xs text-muted-foreground">{coupon.detail}</Text> : null}
                  </View>
                  {coupon.amountLabel ? <Text className="text-sm font-semibold text-primary">{coupon.amountLabel}</Text> : null}
                </View>
              </ComboboxItem>)}
              {/* ui/combobox's ComboboxEmpty has fixed copy, so v2's "No coupons found" (core.json:1126) is drawn here. */}
              {shown.length ? null : <View className="py-6"><Text className="text-center text-sm text-muted-foreground">No coupons found</Text></View>}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </View>
      {/* v2 add-coupon.tsx:110-143: "+" beside the picker; a disabled one gives its reason as tooltip and accessibilityHint. */}
      {onNewCoupon ? <Tooltip><TooltipTrigger asChild>
        <IconButton variant="ghost" testID="add-coupon-new" accessibilityLabel="New coupon" disabled={!!newCouponDisabledReason}
          accessibilityHint={newCouponDisabledReason || undefined} onPress={onNewCoupon}>
          <View className="text-foreground"><PlusIcon size={20} /></View>
        </IconButton>
      </TooltipTrigger><TooltipContent><Text>{newCouponDisabledReason || 'New coupon'}</Text></TooltipContent></Tooltip> : null}
    </View>
    <DialogFooter>
      <Pressable accessibilityRole="button" onPress={onClose} className={`${button} bg-card`}><Text className="text-foreground">Cancel</Text></Pressable>
      <Pressable testID="add-coupon-submit" accessibilityRole="button" disabled={picked === null || applying}
        onPress={() => void apply()} className={`${button} bg-primary ${picked === null || applying ? 'opacity-50' : ''}`}>
        <Text className="font-semibold text-primary-foreground">Apply</Text></Pressable>
    </DialogFooter>
  </>;
}

/** `onApply` returns a refusal to show inline (the capability gate), or null once applied. `layout="dialog"`: v2's Add Discount body. */
export function DiscountForm({ title, currency, onApply, onClose, layout = 'inline', onApplyCoupon, coupons = [], onNewCoupon, newCouponDisabledReason }: {
  title?: string; currency: string; onApply: (discount: Discount) => string | null; onClose: () => void; layout?: 'inline' | 'dialog';
  /** layout="dialog" only: with this, the dialog shows v2's Quick discount / Coupon tabs. Resolve a refusal to show, or null once applied (e.g. sale.applyCoupon). */
  onApplyCoupon?: (code: string) => Promise<string | null>;
  /** The coupons the Coupon tab lists (the app's data). Default []. */
  coupons?: readonly DiscountCoupon[];
  /** With this, the Coupon tab shows v2's "New coupon" (+) button; creating the coupon is the app's job. */
  onNewCoupon?: () => void;
  /** Already-translated reason the New coupon button is disabled (e.g. offline); shown as its tooltip and accessibility hint. */
  newCouponDisabledReason?: string;
}) {
  const dialog = layout === 'dialog';
  const [kind, setKind] = useState<'quick' | 'coupon'>('quick'); // v2 add-discount-sheet.tsx:14 opens on Quick discount.
  const [type, setType] = useState<Discount['type']>(dialog ? 'fixed' : 'percentage'); // v2 add-discount.tsx:44 opens at Amount.
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  function apply() {
    const parsed = parseDiscount(type, text, currency);
    const refused = typeof parsed === 'string' ? parsed : onApply(parsed);
    setError(refused);
    if (refused === null) onClose();
  }
  const toggle = (['percentage', 'fixed'] as const).map((option) => <Pressable key={option} accessibilityRole="button"
    accessibilityState={{ selected: type === option }} aria-selected={dialog ? type === option : undefined} onPress={() => setType(option)}
    className={`${button} ${type === option ? 'bg-primary' : 'bg-card'}`}>
    <Text className={type === option ? 'text-primary-foreground' : 'text-foreground'}>{option === 'percentage' ? 'Percent' : 'Amount'}</Text>
  </Pressable>);
  const field = <TextInput accessibilityLabel="Discount value" value={text} onChangeText={setText} onSubmitEditing={apply}
    inputMode="decimal" placeholder={type === 'percentage' ? '%' : currency} testID={dialog ? 'discount-amount-input' : undefined}
    className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground" />;
  const cancel = <Pressable accessibilityRole="button" onPress={onClose} className={`${button} bg-card`}>
    <Text className="text-foreground">Cancel</Text></Pressable>;
  // v2 add-discount-sheet.tsx:22-34: the Quick discount / Coupon segments, only when the app can apply a coupon.
  const tabs = dialog && onApplyCoupon ? <ToggleGroup type="single" variant="outline" value={kind} aria-label="Discount kind"
    onValueChange={(value) => { if (value) setKind(value as 'quick' | 'coupon'); }} className="justify-start">
    {(['quick', 'coupon'] as const).map((id) => <ToggleGroupItem key={id} value={id} testID={`add-discount-kind-${id}`}>
      <Text className="text-sm text-foreground">{id === 'quick' ? 'Quick discount' : 'Coupon'}</Text></ToggleGroupItem>)}
  </ToggleGroup> : null;
  if (tabs && onApplyCoupon && kind === 'coupon') return <View role="group" accessibilityLabel={title ?? 'Discount'} className="gap-2 px-3 py-2">
    {tabs}<CouponTab coupons={coupons} onApplyCoupon={onApplyCoupon} onClose={onClose}
      onNewCoupon={onNewCoupon} newCouponDisabledReason={newCouponDisabledReason} /></View>;
  return <View role="group" accessibilityLabel={title ?? 'Discount'} className="gap-2 px-3 py-2">
    {tabs}
    {title === undefined || dialog ? null : <Text className="font-semibold text-foreground">{title}</Text>}
    <View className="flex-row gap-2">
      {dialog ? <>{field}<View testID="discount-percent-switch" className="flex-row gap-2">{toggle}</View></> : <>{toggle}{field}</>}
    </View>
    {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    {dialog ? <DialogFooter>{cancel}<Pressable testID="add-discount-submit" accessibilityRole="button" onPress={apply}
      className={`${button} bg-primary`}><Text className="font-semibold text-primary-foreground">Add discount</Text></Pressable></DialogFooter>
      : <View className="flex-row gap-2">
      <Pressable accessibilityRole="button" onPress={apply} className={`${button} bg-primary`}>
        <Text className="font-semibold text-primary-foreground">Apply</Text></Pressable>
      {cancel}
    </View>}
  </View>;
}

/** Applied discounts as badges; pressing one removes it through TallyUI's builder. */
/** `prefix` names a chip that would otherwise read like a fee, e.g. "Order discount −€0.50". */
/** `amounts` are order.display's figures by discountId (TallyUI ADR-063): "10% −€0.40", or "−€0.40" for a fixed one. */
export function DiscountChips({ discounts, currency, onRemove, prefix, amounts = [] }: {
  discounts: AppliedDiscount[]; currency: string; onRemove: (id: string) => void; prefix?: string;
  amounts?: { discountId: string; amountMinor: number }[];
}) {
  const formatStoreMoney = useFormatMoney();
  if (!discounts.length) return null;
  return <View className="flex-row flex-wrap gap-2 px-3">
    {discounts.map((discount) => {
      const amount = amounts.find((row) => row.discountId === discount.id)?.amountMinor;
      const own = discountLabel(discount, currency, formatStoreMoney);
      const label = [prefix, amount === undefined ? (prefix ? `−${own}` : own) : discount.type === 'percentage' ? own : null,
        amount === undefined ? null : `−${formatStoreMoney({ amount, currency })}`].filter(Boolean).join(' ');
      return <Pressable key={discount.id} accessibilityRole="button" accessibilityLabel={`Remove discount ${label}`}
        onPress={() => onRemove(discount.id)} className="min-h-11 flex-row items-center gap-1">
        <DiscountBadge label={label} className="self-center" /><Text className="text-muted-foreground">✕</Text>
      </Pressable>;
    })}
  </View>;
}
