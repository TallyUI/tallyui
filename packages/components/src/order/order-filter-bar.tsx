/**
 * The Orders screen's filter pills, in WCPOS v2's order: Status, Payment Method, Customer, Cashier, Store / Created
 * via, Register and Date range, with Clear all. Port of v2 `screens/main/orders/filter-bar.tsx` and its
 * `filter-bar/*-pill.tsx` (MIT, WCPOS); copy is v2's English (`core.json`). Presentational: the app passes the value,
 * the connector's `orderFilters` and every option list, so no platform's words live here.
 */
import { Fragment, useState, type JSX, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { OrderFilterField } from '@tallyui/core';
import { presetRange, type DayRange, type OrderFilterValue } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { rangeLabel } from '../reports/date-range-menu';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxTrigger } from '../ui/combobox';
import { XIcon } from '../ui/icon/x-icon';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger } from '../ui/select';
import { Text as UIText } from '../ui/text';

export interface OrderFilterOption { value: string; label: string }
export type PaymentMethodKind = 'cash' | 'card' | 'stored_value' | 'bank_transfer' | 'other';
export interface OrderFilterBarProps {
  value: OrderFilterValue;
  onChange(next: OrderFilterValue): void;
  /** The connector's orderFilters. A pill shows only when its field is here (store pill: storeId or createdVia). */
  fields: readonly OrderFilterField[];
  /** What Clear all resets to and counts against (v2: cashier + store). Default {}. */
  initial?: OrderFilterValue;
  options?: {
    status?: OrderFilterOption[];
    /** Grouped by kind in this order, with a separator between groups: cash, card, stored_value, bank_transfer, other. */
    paymentMethod?: (OrderFilterOption & { kind?: PaymentMethodKind })[];
    customer?: OrderFilterOption[];
    cashier?: OrderFilterOption[];
    register?: OrderFilterOption[];
    store?: OrderFilterOption[];
    createdVia?: OrderFilterOption[];
  };
  /** The customer and cashier pills search through these when given; otherwise they filter their options locally. */
  onCustomerSearch?(text: string): void;
  onCashierSearch?(text: string): void;
  /** IANA zone of the store, or 'device'. */
  timezone: string;
  now?: () => Date;
  testID?: string;
}

const KINDS: readonly PaymentMethodKind[] = ['cash', 'card', 'stored_value', 'bank_transfer', 'other'];
// The chip look is ProductFilterBar's; the trigger inside it drops the form-field look of SelectTrigger/ComboboxTrigger.
const chipClass = (on: boolean) => cn('min-h-11 flex-row items-center gap-1.5 rounded-full border px-3',
  on ? 'border-primary/30 bg-primary/10' : 'border-border bg-card');
const TRIGGER_RESET = 'h-auto min-h-11 w-auto justify-start rounded-none border-0 bg-transparent px-0 py-0';
const labelOf = (options: OrderFilterOption[] | undefined, value: string) => options?.find((o) => o.value === value)?.label ?? value;
const sameRange = (a?: DayRange, b?: DayRange) => a?.from === b?.from && a?.to === b?.to;
// Clear all counts pills, as v2 counts its filters: the store pill's two fields are one.
const SIMPLE = ['status', 'paymentMethod', 'customerId', 'cashierId', 'registerId'] as const;
const changedCount = (value: OrderFilterValue, initial: OrderFilterValue) =>
  SIMPLE.filter((key) => value[key] !== initial[key]).length
  + (value.storeId !== initial.storeId || value.createdVia !== initial.createdVia ? 1 : 0)
  + (sameRange(value.dateRange, initial.dateRange) ? 0 : 1);

function Chip({ id, on, label, onClear, trigger }: {
  id: string; on: boolean; label: string; onClear: () => void; trigger: (children: ReactNode) => ReactNode;
}) {
  return (
    <View className={chipClass(on)}>
      {trigger(<Text className={cn('text-sm', on ? 'text-primary' : 'text-foreground')}>{label}</Text>)}
      {on ? (
        <Pressable testID={`${id}-remove`} role="button" accessibilityLabel="Remove" onPress={onClear}
          hitSlop={8} className="min-h-11 min-w-8 items-center justify-center text-primary">
          <XIcon size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

function SelectPill({ id, offLabel, selected, onClear, children }: {
  id: string; offLabel: string; selected?: OrderFilterOption; onClear: () => void; children: ReactNode;
}) {
  return (
    <Select value={selected}>
      <Chip id={id} on={!!selected} label={selected?.label ?? offLabel} onClear={onClear}
        trigger={(label) => <SelectTrigger testID={id} className={TRIGGER_RESET}>{label}</SelectTrigger>} />
      <SelectContent testID={`${id}-menu`}>{children}</SelectContent>
    </Select>
  );
}

function Item({ id, option, onPress }: { id: string; option: OrderFilterOption; onPress: () => void }) {
  return (
    <SelectItem testID={`${id}-${option.value}`} value={option.value} label={option.label} onPress={onPress}>
      <Text className="text-sm text-popover-foreground">{option.label}</Text>
    </SelectItem>
  );
}

function ComboboxPill({ id, offLabel, placeholder, value, options, onSearch, onPick, onClear }: {
  id: string; offLabel: string; placeholder: string; value?: string; options: OrderFilterOption[];
  onSearch?: (text: string) => void; onPick: (value: string) => void; onClear: () => void;
}) {
  const [search, setSearch] = useState('');
  const selected = value === undefined ? undefined : { value, label: labelOf(options, value) };
  const needle = search.trim().toLowerCase();
  const shown = onSearch || !needle ? options : options.filter((o) => o.label.toLowerCase().includes(needle));
  return (
    <Combobox value={selected} onValueChange={(next) => { if (next) onPick(next.value); }} searchValue={search}
      onSearchValueChange={(text) => { setSearch(text); onSearch?.(text); }}>
      <Chip id={id} on={!!selected} label={selected?.label ?? offLabel} onClear={onClear}
        trigger={(label) => <ComboboxTrigger testID={id} className={TRIGGER_RESET}>{label}</ComboboxTrigger>} />
      <ComboboxContent testID={`${id}-menu`}>
        <View className="border-b border-border px-2 py-1.5">
          <ComboboxInput testID={`${id}-search`} placeholder={placeholder} />
        </View>
        {shown.map((option) => (
          <ComboboxItem key={option.value} testID={`${id}-${option.value}`} value={option.value} label={option.label}>
            <Text className="text-sm text-popover-foreground">{option.label}</Text>
          </ComboboxItem>
        ))}
        {shown.length === 0 ? <ComboboxEmpty /> : null}
      </ComboboxContent>
    </Combobox>
  );
}

function DatePill({ value, onPick, onClear, timezone, now }: {
  value?: DayRange; onPick: (range: DayRange) => void; onClear: () => void; timezone: string; now?: () => Date;
}) {
  const id = 'order-filter-date';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange | null>(value ?? null);
  const at = (now ?? (() => new Date()))();
  const today = presetRange('today', at, timezone);
  const label = !value ? 'Date range'
    : sameRange(value, today) ? 'Today'
      : sameRange(value, presetRange('yesterday', at, timezone)) ? 'Yesterday' : rangeLabel(value);
  const openChange = (next: boolean) => {
    if (next) setDraft(value ?? null);
    setOpen(next);
  };
  const done = () => {
    setOpen(false);
    if (draft) onPick(draft);
  };
  return (
    <Popover open={open} onOpenChange={openChange}>
      <Chip id={id} on={!!value} label={label} onClear={onClear}
        trigger={(text) => <PopoverTrigger testID={id} role="button" className="min-h-11 flex-row items-center">{text}</PopoverTrigger>} />
      <PopoverContent testID={`${id}-popover`} align="start" className="w-auto p-2">
        <Calendar testID={`${id}-calendar`} mode="range" value={draft} onChange={setDraft} today={today.from} />
        <View className="flex-row justify-end pt-2">
          <Pressable testID={`${id}-done`} accessibilityRole="button" onPress={done}
            className="h-10 justify-center rounded-md bg-primary px-4 active:opacity-90">
            <Text className="text-sm font-medium text-primary-foreground">Done</Text>
          </Pressable>
        </View>
      </PopoverContent>
    </Popover>
  );
}

export function OrderFilterBar({
  value, onChange, fields, initial = {}, options = {}, onCustomerSearch, onCashierSearch, timezone, now,
  testID = 'order-filter-bar',
}: OrderFilterBarProps): JSX.Element {
  const has = (field: OrderFilterField) => fields.includes(field);
  const set = (patch: OrderFilterValue) => onChange({ ...value, ...patch });
  const option = (list: OrderFilterOption[] | undefined, v: string | undefined) => (v === undefined ? undefined : { value: v, label: labelOf(list, v) });
  const changed = changedCount(value, initial);
  const payment = options.paymentMethod ?? [];
  const paymentGroups = KINDS.map((kind) => payment.filter((o) => (o.kind ?? 'other') === kind)).filter((group) => group.length > 0);
  const viaGroup = has('createdVia') ? options.createdVia ?? [] : [];
  const storeGroup = has('storeId') ? options.store ?? [] : [];
  const storeSelected = value.storeId !== undefined ? option(options.store, value.storeId) : option(options.createdVia, value.createdVia);
  const customers = options.customer ?? [];
  const cashiers = options.cashier ?? [];

  return (
    <View testID={testID} className="flex-row items-center gap-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerClassName="flex-row items-center gap-2">
        {has('status') && options.status?.length ? (
          <SelectPill id="order-filter-status" offLabel="Status" selected={option(options.status, value.status)}
            onClear={() => set({ status: undefined })}>
            {options.status.map((o) => <Item key={o.value} id="order-filter-status" option={o} onPress={() => set({ status: o.value })} />)}
          </SelectPill>
        ) : null}
        {has('paymentMethod') ? (
          <SelectPill id="order-filter-payment-method" offLabel="Payment Method" selected={option(payment, value.paymentMethod)}
            onClear={() => set({ paymentMethod: undefined })}>
            {paymentGroups.length === 0 ? (
              <Text className="px-2 py-1.5 text-sm text-muted-foreground">No payment methods found</Text>
            ) : paymentGroups.map((group, i) => (
              <Fragment key={group[0].kind ?? 'other'}>
                {i > 0 ? <SelectSeparator testID="order-filter-payment-method-separator" /> : null}
                <SelectGroup>
                  {group.map((o) => <Item key={o.value} id="order-filter-payment-method" option={o} onPress={() => set({ paymentMethod: o.value })} />)}
                </SelectGroup>
              </Fragment>
            ))}
          </SelectPill>
        ) : null}
        {has('customerId') && (customers.length > 0 || onCustomerSearch) ? (
          <ComboboxPill id="order-filter-customer" offLabel="Select Customer" placeholder="Search Customers" value={value.customerId}
            options={customers} onSearch={onCustomerSearch} onPick={(v) => set({ customerId: v })} onClear={() => set({ customerId: undefined })} />
        ) : null}
        {has('cashierId') && (cashiers.length > 0 || onCashierSearch) ? (
          <ComboboxPill id="order-filter-cashier" offLabel="Select Cashier" placeholder="Search Cashiers" value={value.cashierId}
            options={cashiers} onSearch={onCashierSearch} onPick={(v) => set({ cashierId: v })} onClear={() => set({ cashierId: undefined })} />
        ) : null}
        {viaGroup.length > 0 || storeGroup.length > 0 ? (
          <SelectPill id="order-filter-store" offLabel="Created via" selected={storeSelected}
            onClear={() => set({ storeId: undefined, createdVia: undefined })}>
            {viaGroup.length > 0 ? (
              <SelectGroup testID="order-filter-store-created-via">
                <SelectLabel className="pl-2">Created via</SelectLabel>
                {viaGroup.map((o) => <Item key={o.value} id="order-filter-store" option={o} onPress={() => set({ createdVia: o.value, storeId: undefined })} />)}
              </SelectGroup>
            ) : null}
            {viaGroup.length > 0 && storeGroup.length > 0 ? <SelectSeparator /> : null}
            {storeGroup.length > 0 ? (
              <SelectGroup testID="order-filter-store-stores">
                <SelectLabel className="pl-2">Store</SelectLabel>
                {storeGroup.map((o) => <Item key={o.value} id="order-filter-store" option={o} onPress={() => set({ storeId: o.value, createdVia: undefined })} />)}
              </SelectGroup>
            ) : null}
          </SelectPill>
        ) : null}
        {has('registerId') && options.register?.length ? (
          <SelectPill id="order-filter-register" offLabel="Select register" selected={option(options.register, value.registerId)}
            onClear={() => set({ registerId: undefined })}>
            {options.register.map((o) => <Item key={o.value} id="order-filter-register" option={o} onPress={() => set({ registerId: o.value })} />)}
          </SelectPill>
        ) : null}
        {has('dateRange') ? (
          <DatePill value={value.dateRange} onPick={(range) => set({ dateRange: range })} onClear={() => set({ dateRange: undefined })}
            timezone={timezone} now={now} />
        ) : null}
      </ScrollView>
      {changed >= 2 ? (
        <Button variant="link" size="sm" testID="orders-filter-clear-all" onPress={() => onChange({ ...initial })}>
          <UIText>Clear all</UIText>
        </Button>
      ) : null}
    </View>
  );
}
