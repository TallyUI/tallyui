/** Converts a plain decimal percentage with at most four fractional digits to safe integer ppm. */
export function ratePpmFromPercent(percent: number | string): number {
  const value = String(percent);
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match || match[0] !== value) {
    throw new RangeError('Percent must be a plain decimal with at most four fractional digits');
  }
  const ratePpm = BigInt(match[1]) * 10000n + BigInt((match[2] ?? '').padEnd(4, '0'));
  if (ratePpm > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Rate must be a safe integer');
  }
  return Number(ratePpm);
}
