import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { formatMoney } from '@tallyui/core';
import { buildReceiptData } from '@tallyui/pos';
import type { useSale } from '@tallyui/pos';
import { CartColumnHeads, CartFoot, CartLine, CartLineActions, CartPanel, CartTotal, type CartFootAction } from '../cart';
import { cartShowsPrice } from '../cart/cart-columns';
import { DiscountChips, DiscountForm } from './discount-form';
import { PriceForm } from './price-form';
import { ChargeForm } from './charge-form';
import { LinePopover } from './line-popover';
import { ShoppingCartIcon } from '../ui';

/** `taxLabel` names each tax row; VAT isn't universal, so a platform passes its own (medusapos passes `VAT ${rate}%`). */
export function Cart({ sale, taxLabel = (ratePpm: number) => `Tax ${ratePpm / 10000}%`, canEditPrice = false, onPriceChange, quickDiscounts, taxClasses, afterSubtotal, couponDiscountMinor, orderActions = true, checkout, lineEditor = 'inline',
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
    /** The coupon amount the app itemises in `afterSubtotal` (e.g. Σ `order.display.coupons`), in integer minor units of
     * the order's currency, in the display mode. When given, the Discount row shows the other discounts only (the
     * totals' discount minus this) and is hidden when they come to 0. Absent: the Discount row is the whole discount. */
    couponDiscountMinor?: number;
    /** Cart's own Order discount and Add charge controls; pass `false` when the app hosts them in its own menu (v2's
     * cart "+" menu). Applied discounts and charges still show and can be removed. */
    orderActions?: boolean;
    /** Swaps the Cash and Card terminal row for v2's foot, `CartFoot`: "Checkout {total}" calls `onCheckout`, and the
     * ⋮ menu lists `actions`. Absent: the Cash and Card terminal row. */
    checkout?: { onCheckout: () => void; actions?: readonly CartFootAction[] };
    /** `popover`: tapping a line's quantity or price opens v2's keypad (WCPOS cart cells/quantity-keypad.tsx and
     * cells/price.tsx), the price one with the quick-discount keys and the struck regular price. Popover mode draws no
     * button row under the line: Discount, Price (narrow cart) and Remove are in the quantity popover, Discount in the
     * price popover. Default `inline`: the − / + buttons and Price form. */
    lineEditor?: 'inline' | 'popover';
    /** The empty cart's icon, centred above `emptyText` and hidden from screen readers. Default: v2's cart icon in the
     * muted colour. Pass `null` for no icon. */
    emptyIcon?: ReactNode;
    /** The empty cart's line. Default: v2's "Tap a product to start a sale". */
    emptyText?: string;
  }) {
  const { order } = sale;
  // v2's empty cart: an icon and a line, no heads and no foot. A fee or shipping row alone keeps the cart.
  const empty = !order.lineItems.length && !order.fees?.length && !order.shipping?.length;
  const money = (amount: number) => ({ amount, currency: order.currency });
  // order.display's figures (TallyUI ADR-063), with its tax split by rate; never app arithmetic (medusapos ADR 0008).
  const { totals } = buildReceiptData(order, { storeName: '' });
  const taxRows = totals.taxLines.map((line) => ({ label: taxLabel(line.ratePpm), amount: money(line.amountMinor) }));
  // Each line before its discounts, with its own discounts' amounts. The order discounts are one figure: a single
  // order discount's chip carries it; several keep their own labels, as no single one has a display amount.
  const display = (lineId: string) => order.display.lines.find((line) => line.lineId === lineId)!;
  const orderAmounts = order.discounts.length === 1
    ? [{ discountId: order.discounts[0].id, amountMinor: order.display.orderDiscountMinor }] : [];
  // One open form: a line's discount or price, the order's discount (lineId null), or a charge.
  const [form, setForm] = useState<{ type: 'discount'; lineId: string | null } | { type: 'price'; lineId: string } | { type: 'charge' } | null>(null);
  const chargesOffered = (sale.capabilities?.orderCreate ?? 0) >= 5;
  const showOrderDiscount = order.lineItems.length > 0 && (orderActions || order.discounts.length > 0);
  const showCharge = orderActions && chargesOffered;
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
    return refused;
  };
  const renderItem = (line: typeof order.lineItems[number]) => <>
    <CartLine name={line.name} attributes={line.attributes} quantity={line.quantity} unitPrice={money(line.unitPriceMinor)}
      regularUnitPrice={line.regularUnitPriceMinor === undefined ? undefined : money(line.regularUnitPriceMinor)}
      lineTotal={money(display(line.id).amountMinor)} showPrice={showPrice}
      quantitySlot={lineEditor === 'popover' ? <LinePopover kind="quantity" lineName={line.name} currency={order.currency}
        value={line.quantity} onApply={(quantity) => { sale.setQuantity(line.id, quantity); return null; }} actions={[
          ...(!pricePopover ? [{ id: 'discount', label: 'Discount', onPress: () => setForm({ type: 'discount', lineId: line.id }) }] : []),
          ...(canEditPrice && !pricePopover ? [{ id: 'price', label: 'Price', onPress: () => setForm({ type: 'price', lineId: line.id }) }] : []),
          { id: 'remove', label: 'Remove', destructive: true, onPress: () => sale.remove(line.id) },
        ]} /> : undefined}
      priceSlot={pricePopover ? <LinePopover kind="price" lineName={line.name} currency={order.currency} value={line.unitPriceMinor}
        regularValue={line.regularUnitPriceMinor} actions={[{ id: 'discount', label: 'Discount', onPress: () => setForm({ type: 'discount', lineId: line.id }) }]}
        quickDiscounts={quickDiscounts} textClassName="text-right text-muted-foreground" onApply={(amount) => applyPrice(line, amount)} /> : undefined} />
    <DiscountChips discounts={line.discounts} amounts={display(line.id).discounts} currency={order.currency} onRemove={sale.removeDiscount} />
    {lineEditor === 'inline' ? <CartLineActions actions={[
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
    {empty ? null : <CartColumnHeads showPrice={showPrice} />}
    <CartPanel items={order.lineItems} renderItem={renderItem}
    emptyState={empty ? <View testID="cart-empty" className="flex-1 items-center justify-center gap-3 px-3 py-6">
      {emptyIcon === null ? null : <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        className="text-muted-foreground">{emptyIcon}</View>}
      <Text testID="cart-empty-text" className="text-center text-muted-foreground">{emptyText}</Text>
      {/* The footer is gone, so a resume or coupon message on an empty cart shows here. */}
      {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{sale.error}</Text> : null}
    </View> : undefined}
    afterItems={<>
      {(['fees', 'shipping'] as const).map((kind) => order[kind]?.map((charge, index) =>
        <View key={charge.id} testID={`cart-${kind === 'fees' ? 'fee' : 'shipping'}-${index}`} className="flex-row items-center gap-3 px-3 py-2">
          <Text className="flex-1 text-foreground">{charge.name}</Text>
          <Text className="text-foreground">{formatMoney(money(order.display[kind]!.find((row) => row.id === charge.id)!.amountMinor))}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${charge.name}`}
            onPress={() => kind === 'fees' ? sale.removeFee(charge.id) : sale.removeShipping(charge.id)}
            className="rounded-md border border-border bg-card px-3 py-2 min-h-11 items-center justify-center">
            <Text className="text-foreground">Remove</Text></Pressable>
        </View>))}
      {showOrderDiscount || showCharge ? <View className="gap-3 px-3 py-2">
      {showOrderDiscount ? <>
      <DiscountChips discounts={order.discounts} amounts={orderAmounts} currency={order.currency} onRemove={sale.removeDiscount}
        prefix="Order discount" />
      {!orderActions ? null : form?.type === 'discount' && form.lineId === null ? discountForm(null, 'Order discount') : <Pressable accessibilityRole="button"
        onPress={() => setForm({ type: 'discount', lineId: null })} className="self-start rounded-md border border-border bg-card px-4 py-2 min-h-11 justify-center">
        <Text className="text-foreground">Order discount</Text></Pressable>}
      </> : null}
      {showCharge ? form?.type === 'charge' ? <ChargeForm currency={order.currency} lineTax={sale.capabilities?.lineTax}
        taxClasses={taxClasses} shippingTaxFromStore={sale.capabilities?.taxRounding?.granularity === 'woocommerce'}
        onClose={() => setForm(null)} onApply={({ kind, name, amountMinor, taxStatus, taxClass }) => {
          const result = kind === 'custom' ? sale.addCustomLine({ name, priceMinor: amountMinor, taxStatus, taxClass })
            : kind === 'fee' ? sale.addFee({ name, amountMinor, taxStatus, taxClass })
              : sale.addShipping({ name, amountMinor, taxStatus, taxClass });
          return typeof result === 'string' ? result : null;
        }} /> : <Pressable accessibilityRole="button" onPress={() => setForm({ type: 'charge' })}
        className="self-start rounded-md border border-border bg-card px-4 py-2 min-h-11 justify-center">
        <Text className="text-foreground">Add charge</Text></Pressable> : null}
    </View> : null}</>}
    footer={empty ? undefined : <View testID="cart-footer" className="gap-3 pb-4">
      {/* Exclusive: subtotal − discount + tax = total. Inclusive: subtotal − discount = total, the tax "incl.", not added. */}
      <CartTotal subtotal={money(totals.subtotalMinor)} total={money(totals.totalMinor)}
        discount={money(couponDiscountMinor === undefined ? totals.discountMinor : Math.max(0, totals.discountMinor - couponDiscountMinor))}
        taxLines={taxRows} taxInclusive={totals.taxInclusive} afterSubtotal={afterSubtotal} />
      {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{sale.error}</Text> : null}
      {checkout ? <CartFoot total={money(totals.totalMinor)} onCheckout={checkout.onCheckout} actions={checkout.actions}
        disabled={!order.lineItems.length} /> : <View className="flex-row gap-3">
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
