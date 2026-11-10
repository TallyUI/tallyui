/** What a cashier sees for a thrown value: an `Error`'s message alone (never its class name, which `String(e)` prefixes), "Something went wrong" when that is empty. A non-`Error` is shown as `String(value)`. */
export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text || 'Something went wrong';
}
