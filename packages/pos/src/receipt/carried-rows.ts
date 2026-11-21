/** A carried coupon's receipt label: derived from `carried`, never stored (Front desk, 2026-11-21). */
export const carriedCouponLabel = (code: string) => `coupon ${code} not accepted at send`;

/** Whether a receipt row is a carried coupon's derived label (carriedCouponLabel). */
export const isCarriedCouponLabel = (label: string) => label.startsWith('coupon ') && label.endsWith(' not accepted at send');

/**
 * One display row per carried coupon, in coupon order, that priced this line. The stored `amountMinor` is in the line's own
 * mode, so it is used only when that is the display mode; otherwise the row is the coupon's share in the display mode.
 */
export function carriedRows(coupons: ReadonlyArray<{ code: string; carried?: true; lines?: ReadonlyArray<{ lineId: string; discountMinor: number; discountTaxMinor: number; amountMinor?: number }> }> | undefined,
  lineId: string, lineInclusive: boolean, displayInclusive: boolean): Array<{ label: string; amountMinor: number }> {
  return (coupons ?? []).flatMap((coupon) => {
    const line = coupon.carried ? coupon.lines?.find((entry) => entry.lineId === lineId) : undefined;
    if (!line) return [];
    const amountMinor = line.amountMinor !== undefined && lineInclusive === displayInclusive ? line.amountMinor
      : displayInclusive ? line.discountMinor + line.discountTaxMinor : line.discountMinor;
    return amountMinor !== 0 ? [{ label: carriedCouponLabel(coupon.code), amountMinor }] : [];
  });
}
