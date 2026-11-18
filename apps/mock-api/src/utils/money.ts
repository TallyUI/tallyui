/** Integer cents to the 2-decimal string the store APIs send. */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}
