// Ported from WCPOS v2 packages/core/src/screens/main/pos/products/chooser-cancel.ts (monorepo 85ecbd43f).
/** WCPOS v2 treats `NotFoundError` and `AbortError` from the serial or HID
 * chooser as the cashier closing it without picking a device. That is a
 * cancel, not a scanner fault. */
export function isChooserCancel(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotFoundError' || name === 'AbortError';
}
