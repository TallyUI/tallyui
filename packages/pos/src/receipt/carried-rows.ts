/** A carried coupon's receipt label: derived from `carried`, never stored (Front desk, 2026-11-21). */
export const carriedCouponLabel = (code: string) => `coupon ${code} not accepted at send`;

/** Whether a receipt row is a carried coupon's derived label (carriedCouponLabel). */
export const isCarriedCouponLabel = (label: string) => label.startsWith('coupon ') && label.endsWith(' not accepted at send');

/**
 * One display row per carried coupon, in coupon order, that priced this line. The coupon's display row is its shares'
 * total, and the stored `amountMinor` is in each line's own mode, so it is used only when every share stores it and every
 * line of the coupon is in the display mode; otherwise the row is the coupon's share in the display mode on every line.
 * When the coupon's display row is known (`displayRows`, aligned with `coupons`), its last listed line takes what its other
 * rows leave of it, so the rows add up to it even when order-rounded tax puts the shares a cent off; never below 0.
 */
export function carriedRows(coupons: ReadonlyArray<{ code: string; carried?: true; lines?: ReadonlyArray<{ lineId: string; discountMinor: number; discountTaxMinor: number; amountMinor?: number }> }> | undefined,
  lineId: string, inclusiveOf: (lineId: string) => boolean, displayInclusive: boolean,
  displayRows: ReadonlyArray<{ code: string; amountMinor: number }> | undefined): Array<{ label: string; amountMinor: number }> {
  return (coupons ?? []).flatMap((coupon, k) => {
    if (!coupon.carried || !coupon.lines?.some((entry) => entry.lineId === lineId)) return [];
    const shares = coupon.lines;
    const stored = shares.every((share) => share.amountMinor !== undefined && inclusiveOf(share.lineId) === displayInclusive);
    const amounts = shares.map((share) => stored ? share.amountMinor!
      : displayInclusive ? share.discountMinor + share.discountTaxMinor : share.discountMinor);
    const row = displayRows?.[k];
    const last = row && row.code === coupon.code ? row.amountMinor - amounts.slice(0, -1).reduce((sum, amount) => sum + amount, 0) : -1;
    if (last >= 0) amounts[amounts.length - 1] = last;
    const amountMinor = amounts[shares.findIndex((entry) => entry.lineId === lineId)]!;
    return amountMinor !== 0 ? [{ label: carriedCouponLabel(coupon.code), amountMinor }] : [];
  });
}
