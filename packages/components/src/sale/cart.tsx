import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { buildReceiptData } from '@tallyui/pos';
import type { useSale } from '@tallyui/pos';
import { useFormatMoney, type PaymentMethodDescriptor } from '@tallyui/core';
import { CartColumnHeads, CartFoot, CartLine, CartLineActions, CartPanel, CartTotal, type CartFootAction } from '../cart';
import { CartChargeLine } from '../cart/cart-charge-line';
import { CartLineStrip } from '../cart/cart-line-strip';
import { MotionRows } from '../cart/cart-row-motion';
import { cartShowsPrice } from '../cart/cart-columns';
import type { CartColumnSettings } from '../cart/cart-columns';
import { DiscountChips, DiscountForm } from './discount-form';
import { PriceForm } from './price-form';
import { ChargeForm } from './charge-form';
import { LinePopover } from './line-popover';
import { OrderNoteSheet } from './order-note-sheet';
import { TenderLedger } from './tender-ledger';
import { ShoppingCartIcon } from '../ui';
import { useT } from '../i18n';
import { saleErrorText } from './sale-error-text';

/** `taxLabel` names each tax row; VAT isn't universal, so a platform passes its own (medusapos passes `VAT ${rate}%`). */
export function Cart({ sale, taxLabel = (ratePpm: number) => `Tax ${ratePpm / 10000}%`, canEditPrice = false, onPriceChange, quickDiscounts, taxClasses, afterSubtotal, showTotal = true, couponDiscountMinor, orderActions = true, orderDiscountChips = true, checkout, noteSheet, tenderLedger, picker, lineEditor = 'inline',
  lineCommit = 'apply', columns, chargeTaxSwitch = true,
  emptyIcon = <ShoppingCartIcon size={48} />, emptyText = 'Tap a product to start a sale' }:
  { sale: ReturnType<typeof useSale>; taxLabel?: (ratePpm: number) => string;
    taxClasses?: ReadonlyArray<{ id: string; label: string }>;
    /** Shows a Price action on each line. Pass the till's own permission; the control isn't shown without it. */
    canEditPrice?: boolean;
    /** Called after a price is applied, for the app's audit log. The reason is kept only here. */
    onPriceChange?: (change: { lineId: string; fromMinor: number; toMinor: number; reason?: string }) => void;
    /** v2's quick-discount keys on each line's Price form (e.g. the app's `cart.quickDiscounts` setting); needs `canEditPrice`. */
    quickDiscounts?: readonly number[];
    /** Rows under the totals' Subtotal, e.g. the platform's coupon chips (passed to CartTotal). */
    afterSubtotal?: ReactNode;
    /** Draws the totals' Total row. Pass `false` for v2's cart, where the total is on the Checkout button (`checkout`). Default `true`. */
    showTotal?: boolean;
    /** The coupon amount the app itemises in `afterSubtotal` (e.g. Σ `order.display.coupons` and, with
     * `orderDiscountChips={false}`, `order.display.orderDiscountMinor`), in integer minor units of
     * the order's currency, in the display mode. When given, the Discount row shows the other discounts only (the
     * totals' discount minus this) and is hidden when they come to 0. Absent: the Discount row is the whole discount. */
    couponDiscountMinor?: number;
    /** Cart's own Order discount and Add charge controls; pass `false` when the app hosts them in its own menu (v2's
     * cart "+" menu). Applied discounts and charges still show and can be removed. */
    orderActions?: boolean;
    /** Draws the applied order discounts as removable chips under the lines. Pass `false` when the app draws them itself,
     * e.g. as a removable Discount row in `afterSubtotal`; add their amount (`order.display.orderDiscountMinor`) to
     * `couponDiscountMinor` so the Discount row does not count them twice. Default `true`. */
    orderDiscountChips?: boolean;
    /** Swaps the Cash and Card terminal row for v2's foot, `CartFoot`: "Checkout {total}" calls `onCheckout`, and the
     * ⋮ menu lists `actions`, with `note` above the buttons. Absent: the Cash and Card terminal row. */
    checkout?: { onCheckout: () => void; actions?: readonly CartFootAction[]; note?: { text: string; onPress: () => void } };
    /** v2's note editing, owned by the Cart: the ⋮ menu gains "Order details" (first), which opens `OrderNoteSheet`
     * on `sale.order.note`, and the note row above the buttons shows that note and opens the sheet too. `label`
     * names the note (default "Customer note"; a platform whose note the customer never sees passes its own, e.g.
     * "Order note"). Needs `checkout`; when given, it replaces `checkout.note`. */
    noteSheet?: { label?: string };
    /** v2's checkout cart (stilled-cart.tsx): while `sale.stage` is tender, the payments ledger (each leg with its status and Cancel payment, then Total, Paid and Remaining) sits under the totals in place of the foot. `methods` names the legs, as on Tender. Pair it with `<Tender ledger={false} />`. `confirmVoid` asks v2's "Cancel this payment?" before a leg is voided (default `false`). `beforeVoid` runs before Cancel payment voids a leg, as on TenderLedger. */
    tenderLedger?: { methods?: PaymentMethodDescriptor[]; confirmVoid?: boolean; beforeVoid?: ComponentProps<typeof TenderLedger>['beforeVoid']; afterVoid?: ComponentProps<typeof TenderLedger>['afterVoid'] };
    /** WCPOS v2's split-by-item bill (stilled-cart.tsx): the cart is read-only, and each line whose quantity is a positive
     * whole number, whose total is not negative and that has units left unpaid shows this payment's `− n of unpaid +`
     * stepper in its quantity cell, with what the picked units add under it. `picked`: this payment's units per line id;
     * `paid`: the units earlier live payments took per line id; `unitMinor(lineId, units)`: the minor units `units` more
     * of that line add after the paid ones; `onPick(lineId, units)` sets this payment's units. */
    picker?: { picked: Readonly<Record<string, number>>; paid: Readonly<Record<string, number>>;
      unitMinor: (lineId: string, units: number) => number; onPick: (lineId: string, units: number) => void };
    /** `popover`: tapping a line's quantity or price opens v2's keypad (WCPOS cart cells/quantity-keypad.tsx and
     * cells/price.tsx), the price one with the quick-discount keys and the struck regular price. Popover mode draws no
     * button row under the line: Discount, Price (narrow cart) and Remove are in the quantity popover, Discount in the
     * price popover. Default `inline`: the − / + buttons and Price form. */
    lineEditor?: 'inline' | 'popover';
    /** With `lineEditor="popover"`, `close` gives both popovers v2's grow keypad (LinePopover's `commit="close"`): Done;
     * Escape closes without writing, any other close writes what was typed, and a refused price on that close shows under
     * the line. The quantity one adds − / + steppers that write at once, − turning into Remove at 1 (in place of the
     * Remove action). Default `apply`. */
    lineCommit?: 'apply' | 'close';
    /** v2's Cart Settings › Columns: which columns show, a Split link under a quantity above 1 (`quantity.split`) and the
     * SKU under the name (`name.sku`). The defaults are today's cart: Qty, Item, Price (folding as before) and Total. */
    columns?: CartColumnSettings;
    /** Shows ChargeForm's "Amount Includes Tax" switch on fees and shipping. Pass `false` to hide it, so a new charge takes
     * the store's tax mode; an existing charge keeps the flag it already has. Default `true`. */
    chargeTaxSwitch?: boolean;
    /** The empty cart's icon, centred above `emptyText` and hidden from screen readers. Default: v2's cart icon in the
     * muted colour. Pass `null` for no icon. */
    emptyIcon?: ReactNode;
    /** The empty cart's line. Default: v2's "Tap a product to start a sale". */
    emptyText?: string;
  }) {
  const t = useT();
  const { order } = sale;
  const [noteOpen, setNoteOpen] = useState(false);
  // v2's empty cart: an icon and a line, no heads and no foot. A fee or shipping row alone keeps the cart.
  const empty = !order.lineItems.length && !order.fees?.length && !order.shipping?.length;
  const money = (amount: number) => ({ amount, currency: order.currency });
  // order.display's figures (TallyUI ADR-063), with its tax split by rate; never app arithmetic (medusapos ADR 0008).
  const { totals, fees, shipping } = buildReceiptData(order, { storeName: '' });
  const taxRows = totals.taxLines.map((line) => ({ label: taxLabel(line.ratePpm), amount: money(line.amountMinor) }));
  // Each line before its discounts, with its own discounts' amounts. The order discounts are one figure: a single
  // order discount's chip carries it; several keep their own labels, as no single one has a display amount.
  const display = (lineId: string) => order.display.lines.find((line) => line.lineId === lineId)!;
  const orderAmounts = order.discounts.length === 1
    ? [{ discountId: order.discounts[0].id, amountMinor: order.display.orderDiscountMinor }] : [];
  // A line's Split refusal, shown under that line until its next split or another line's split attempt.
  const [splitError, setSplitError] = useState<{ lineId: string; message: string } | null>(null);
  const split = (lineId: string) => {
    const refused = sale.splitLine(lineId);
    setSplitError(refused === null ? null : { lineId, message: refused });
  };
  // A line's price refused on a popover close (lineCommit="close"), shown under it until that line's next price write.
  const [priceError, setPriceError] = useState<{ lineId: string; message: string } | null>(null);
  // One open form: a line's discount or price, the order's discount (lineId null), a new charge, or a charge's edit.
  const [openForm, setForm] = useState<{ type: 'discount'; lineId: string | null } | { type: 'price'; lineId: string } | { type: 'charge' }
    | { type: 'edit-charge'; kind: 'fees' | 'shipping'; id: string } | null>(null);
  // The picker's bill is read-only: no form shows, nor any control that opens one.
  const form = picker ? null : openForm;
  const ChargeStrip = picker ? ReadOnlyStrip : CartLineStrip;
  const chargesOffered = (sale.capabilities?.orderCreate ?? 0) >= 5;
  // #1115: front desk 2026-11-20, a Woo store at order.create 6+ takes a No tax shipping line (stock 2.0.4 proof F2).
  const shippingNoTax = (sale.capabilities?.orderCreate ?? 0) >= 6;
  const showOrderDiscount = !picker && order.lineItems.length > 0 && (orderActions || (orderDiscountChips && order.discounts.length > 0));
  const showCharge = !picker && orderActions && chargesOffered;
  const discountForm = (lineId: string | null, title: string) => form?.type === 'discount' && form.lineId === lineId
    ? <DiscountForm key={lineId ?? 'order'} title={title} currency={order.currency} onClose={() => setForm(null)}
      onApply={(discount) => sale.applyDiscount(lineId, discount)} /> : null;
  const pay = `min-h-12 flex-1 justify-center rounded-md bg-primary px-4 py-3 ${!order.lineItems.length ? 'opacity-50' : ''}`;
  // The Price column folds on a narrow cart or a phone window (v2's rule), in the heads and every line alike.
  const [cartWidth, setCartWidth] = useState<number>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const showPrice = cartShowsPrice({ cartWidth, windowWidth, windowHeight });
  // The price popover needs the Price column; on a narrow cart the Price action and form stay.
  const pricePopover = lineEditor === 'popover' && canEditPrice && showPrice;
  // A line's price write, from the Price form or the price popover; the reason is passed only to onPriceChange.
  const applyPrice = (line: typeof order.lineItems[number], amount: number, reason?: string) => {
    const fromMinor = line.unitPriceMinor;
    const refused = sale.setUnitPrice(line.id, amount);
    if (refused === null) onPriceChange?.({ lineId: line.id, fromMinor, toMinor: amount, reason });
    if (refused === null) setPriceError((now) => (now?.lineId === line.id ? null : now));
    return refused;
  };
  const unpaid = (line: typeof order.lineItems[number]) => line.quantity - (picker?.paid[line.id] ?? 0);
  const pickable = (line: typeof order.lineItems[number]) => Number.isInteger(line.quantity) && line.quantity > 0
    && display(line.id).amountMinor >= 0 && unpaid(line) > 0;
  const renderItem = (line: typeof order.lineItems[number]) => <>
    <CartLine name={line.name} attributes={line.attributes} quantity={line.quantity} unitPrice={money(line.unitPriceMinor)}
      regularUnitPrice={line.regularUnitPriceMinor === undefined ? undefined : money(line.regularUnitPriceMinor)}
      lineTotal={money(display(line.id).amountMinor)} showPrice={showPrice}
      columns={columns} sku={line.sku} imageUrl={line.imageUrl} onSplit={picker ? undefined : () => split(line.id)} picking={picker !== undefined}
      quantitySlot={picker ? pickable(line) ? <PickStepper picker={picker} id={line.id} name={line.name} unpaid={unpaid(line)}
        currency={order.currency} /> : undefined : lineEditor === 'popover' ? <LinePopover kind="quantity" lineName={line.name} currency={order.currency}
        value={line.quantity} onApply={(quantity) => { sale.setQuantity(line.id, quantity); return null; }} commit={lineCommit}
        onRemove={lineCommit === 'close' ? () => sale.remove(line.id) : undefined} actions={[
          ...(!pricePopover ? [{ id: 'discount', label: 'Discount', onPress: () => setForm({ type: 'discount', lineId: line.id }) }] : []),
          ...(canEditPrice && !pricePopover ? [{ id: 'price', label: 'Price', onPress: () => setForm({ type: 'price', lineId: line.id }) }] : []),
          ...(lineCommit === 'close' ? [] : [{ id: 'remove', label: 'Remove', destructive: true, onPress: () => sale.remove(line.id) }]),
        ]} /> : undefined}
      priceSlot={pricePopover && !picker ? <LinePopover kind="price" lineName={line.name} currency={order.currency} value={line.unitPriceMinor}
        regularValue={line.regularUnitPriceMinor} actions={[{ id: 'discount', label: 'Discount', onPress: () => setForm({ type: 'discount', lineId: line.id }) }]}
        quickDiscounts={quickDiscounts} textClassName="text-right text-muted-foreground" onApply={(amount) => applyPrice(line, amount)}
        commit={lineCommit} onCloseRefused={(message) => setPriceError({ lineId: line.id, message })} /> : undefined} />
    {splitError?.lineId === line.id ? <Text accessibilityRole="alert" testID="cart-line-split-error"
      className="px-3 text-sm text-destructive">{splitError.message}</Text> : null}
    {priceError?.lineId === line.id ? <Text accessibilityRole="alert" testID="cart-line-price-error"
      className="px-3 text-sm text-destructive">{priceError.message}</Text> : null}
    {picker ? null : <DiscountChips discounts={line.discounts} amounts={display(line.id).discounts} currency={order.currency} onRemove={sale.removeDiscount} />}
    {lineEditor === 'inline' && !picker ? <CartLineActions actions={[
      { id: 'discount', label: 'Discount', color: 'text-primary', onPress: () => setForm({ type: 'discount', lineId: line.id }) },
      ...(canEditPrice && !pricePopover ? [{ id: 'price', label: 'Price', color: 'text-primary', onPress: () => setForm({ type: 'price', lineId: line.id }) }] : []),
    ]}>
      <View className="flex-row gap-4 px-3 py-2">
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${line.name}`}
          onPress={() => sale.setQuantity(line.id, line.quantity - 1)} className="rounded-md border border-border bg-card px-3 py-2 min-h-11 min-w-11 items-center justify-center"><Text className="text-center text-foreground">−</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${line.name}`}
          onPress={() => sale.setQuantity(line.id, line.quantity + 1)} className="rounded-md border border-border bg-card px-3 py-2 min-h-11 min-w-11 items-center justify-center"><Text className="text-center text-foreground">+</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.name}`}
          onPress={() => sale.remove(line.id)} className="rounded-md border border-border bg-card px-3 py-2 min-h-11 min-w-11 items-center justify-center"><Text className="text-center text-foreground">Remove</Text></Pressable>
      </View>
    </CartLineActions> : null}
    {discountForm(line.id, `Discount on ${line.name}`)}
    {canEditPrice && !pricePopover && form?.type === 'price' && form.lineId === line.id ? <PriceForm key={line.id} lineName={line.name}
      currency={order.currency} currentMinor={line.unitPriceMinor} quickDiscounts={quickDiscounts} onClose={() => setForm(null)}
      onApply={(amount, reason) => applyPrice(line, amount, reason)} /> : null}
  </>;
  return <View dataSet={{ print: 'hide' }} className="flex-1 min-h-0" onLayout={(event) => setCartWidth(event.nativeEvent.layout.width)}>
    {empty ? null : <CartColumnHeads showPrice={showPrice} columns={columns} picking={picker !== undefined} />}
    <CartPanel items={order.lineItems} renderItem={renderItem} pulseKey={(line) => line.quantity} identity={order.id}
    footerClassName="px-2 py-2"
    emptyState={empty ? <View testID="cart-empty" className="flex-1 items-center justify-center gap-3 px-3 py-6">
      {emptyIcon === null ? null : <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        className="text-muted-foreground">{emptyIcon}</View>}
      <Text testID="cart-empty-text" className="text-center text-muted-foreground">{emptyText}</Text>
      {/* The footer is gone, so a resume or coupon message on an empty cart shows here. */}
      {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{saleErrorText(t, sale.error)}</Text> : null}
    </View> : undefined}
    afterItems={<>
      {(['fees', 'shipping'] as const).map((kind) => <MotionRows key={kind} items={order[kind] ?? []} keyOf={(charge) => charge.id}
        pulseKey={() => 0} identity={order.id} renderItem={(charge, index) =>
        <View testID={`cart-${kind === 'fees' ? 'fee' : 'shipping'}-${index}`}>
          <ChargeStrip name={charge.name} onEdit={() => setForm({ type: 'edit-charge', kind, id: charge.id })}
            onRemove={() => kind === 'fees' ? sale.removeFee(charge.id) : sale.removeShipping(charge.id)}>
            {(wrapTotal) => <CartChargeLine name={charge.name} price={money(charge.amountMinor)} percent={charge.percent}
              total={money(order.display[kind]!.find((row) => row.id === charge.id)!.amountMinor)}
              showPrice={showPrice} columns={columns} picking={picker !== undefined} testID="cart-charge-line" wrapTotal={wrapTotal} />}
          </ChargeStrip>
          {form?.type === 'edit-charge' && form.kind === kind && form.id === charge.id ? <ChargeForm key={charge.id}
            kind={kind === 'fees' ? 'fee' : 'shipping'} initial={charge} currency={order.currency} lineTax={sale.capabilities?.lineTax}
            allowPercent pricesIncludeTax={chargeTaxSwitch ? order.pricesIncludeTax : undefined}
            taxClasses={taxClasses} shippingTaxFromStore={sale.capabilities?.taxRounding?.granularity === 'woocommerce'}
            shippingNoTax={shippingNoTax} onClose={() => setForm(null)} onApply={({ name, amountMinor, taxStatus, taxClass, amountIncludesTax, percent }) => kind === 'fees'
              ? sale.updateFee(charge.id, { name, amountMinor, taxStatus, taxClass, amountIncludesTax, percent })
              : sale.updateShipping(charge.id, { name, amountMinor, taxStatus, taxClass, amountIncludesTax })} /> : null}
        </View>} />)}
      {showOrderDiscount || showCharge ? <View className="gap-3 px-3 py-2">
      {showOrderDiscount ? <>
      {orderDiscountChips ? <DiscountChips discounts={order.discounts} amounts={orderAmounts} currency={order.currency}
        onRemove={sale.removeDiscount} prefix="Order discount" /> : null}
      {!orderActions ? null : form?.type === 'discount' && form.lineId === null ? discountForm(null, 'Order discount') : <Pressable accessibilityRole="button"
        onPress={() => setForm({ type: 'discount', lineId: null })} className="self-start rounded-md border border-border bg-card px-4 py-2 min-h-11 justify-center">
        <Text className="text-foreground">Order discount</Text></Pressable>}
      </> : null}
      {showCharge ? form?.type === 'charge' ? <ChargeForm currency={order.currency} lineTax={sale.capabilities?.lineTax}
        allowPercent pricesIncludeTax={chargeTaxSwitch ? order.pricesIncludeTax : undefined}
        taxClasses={taxClasses} shippingTaxFromStore={sale.capabilities?.taxRounding?.granularity === 'woocommerce'}
        shippingNoTax={shippingNoTax} onClose={() => setForm(null)} onApply={({ kind, name, amountMinor, taxStatus, taxClass, amountIncludesTax, percent }) => {
          const result = kind === 'custom' ? sale.addCustomLine({ name, priceMinor: amountMinor, taxStatus, taxClass })
            : kind === 'fee' ? sale.addFee({ name, amountMinor, taxStatus, taxClass, amountIncludesTax, percent })
              : sale.addShipping({ name, amountMinor, taxStatus, taxClass, amountIncludesTax });
          return typeof result === 'string' ? result : null;
        }} /> : <Pressable accessibilityRole="button" onPress={() => setForm({ type: 'charge' })}
        className="self-start rounded-md border border-border bg-card px-4 py-2 min-h-11 justify-center">
        <Text className="text-foreground">Add charge</Text></Pressable> : null}
    </View> : null}</>}
    footer={empty ? undefined : <View testID="cart-footer" className="gap-2">
      {/* Exclusive: subtotal − discount + fees + shipping + tax = total. Inclusive: subtotal − discount + fees + shipping =
        total, the tax "incl.", not added. */}
      <CartTotal className="px-0 py-0" subtotal={money(totals.subtotalMinor)} total={money(totals.totalMinor)}
        discount={money(couponDiscountMinor === undefined ? totals.discountMinor : Math.max(0, totals.discountMinor - couponDiscountMinor))}
        fees={money(fees.reduce((sum, row) => sum + row.amountMinor, 0))}
        shipping={money(shipping.reduce((sum, row) => sum + row.amountMinor, 0))}
        taxLines={taxRows} taxInclusive={totals.taxInclusive} afterSubtotal={afterSubtotal} showTotal={showTotal} />
      {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{saleErrorText(t, sale.error)}</Text> : null}
      {tenderLedger && sale.stage.kind === 'tender' ? <TenderLedger sale={sale} methods={tenderLedger.methods} confirmVoid={tenderLedger.confirmVoid} beforeVoid={tenderLedger.beforeVoid} afterVoid={tenderLedger.afterVoid} closing /> : checkout ? <><CartFoot total={money(totals.totalMinor)} onCheckout={checkout.onCheckout}
        actions={noteSheet ? [{ label: 'Order details', onPress: () => setNoteOpen(true) }, ...(checkout.actions ?? [])] : checkout.actions}
        note={noteSheet ? { text: order.note, onPress: () => setNoteOpen(true) } : checkout.note} disabled={!order.lineItems.length} />
        {noteSheet && noteOpen ? <OrderNoteSheet value={order.note} onChangeText={sale.setNote}
          label={noteSheet.label} onOpenChange={setNoteOpen} /> : null}</> : <View className="flex-row gap-3">
        <Pressable accessibilityRole="button" disabled={!order.lineItems.length} onPress={() => sale.startTender('cash')} className={pay}>
          <Text className="text-center font-semibold text-primary-foreground">Cash</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!order.lineItems.length} onPress={() => sale.startTender('external')} className={pay}>
          <Text className="text-center font-semibold text-primary-foreground">Card terminal</Text>
        </Pressable>
      </View>}
    </View>} />
  </View>;
}

/** A fee or shipping row on the picker's read-only bill: the row alone, no Edit or Remove strip. */
const ReadOnlyStrip = ({ children }: Parameters<typeof CartLineStrip>[0]) => <>{children((content) => content)}</>;

/** WCPOS v2's `− n of unpaid +` stepper (tender/unit-stepper.tsx), the one Cart's `picker` draws in each pickable line's
 * quantity cell, with what the picked units add under it. An app cart built on CartPanel and CartLine passes it as
 * CartLine's `quantitySlot` (with `picking`), with the same `picker` object Cart takes. */
export function PickStepper({ picker, id, name, unpaid, currency }: { picker: NonNullable<Parameters<typeof Cart>[0]['picker']>;
  id: string; name: string; unpaid: number; currency: string }) {
  const t = useT();
  const formatMoney = useFormatMoney();
  const units = picker.picked[id] ?? 0;
  const button = 'rounded-md border border-border bg-card px-3 py-2 min-h-11 min-w-11 items-center justify-center';
  return <View className="items-center gap-1">
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel={t('pos_checkout.pick_fewer', { name })} testID={`cart-line-${id}-pick-minus`}
        disabled={units <= 0} onPress={() => picker.onPick(id, units - 1)} className={button}><Text className="text-center text-foreground">−</Text></Pressable>
      <Text testID={`cart-line-${id}-pick-units`} className="tabular-nums text-foreground">{t('pos_checkout.n_of_units', { n: units, total: unpaid })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('pos_checkout.pick_more', { name })} testID={`cart-line-${id}-pick-plus`}
        disabled={units >= unpaid} onPress={() => picker.onPick(id, Math.min(units + 1, unpaid))} className={button}><Text className="text-center text-foreground">+</Text></Pressable>
    </View>
    {units > 0 ? <Text testID={`cart-line-${id}-pick-amount`} className="font-semibold tabular-nums text-foreground">
      {formatMoney({ amount: picker.unitMinor(id, units), currency }) ?? '—'}</Text> : null}
  </View>;
}
