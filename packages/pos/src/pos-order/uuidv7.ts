/** RFC 9562 UUIDv7 with a 48-bit Unix ms timestamp and cryptographic randomness. */
export function uuidv7(now = Date.now(), randomBytes?: (n: number) => Uint8Array): string {
  if (!randomBytes && !globalThis.crypto?.getRandomValues) throw new Error('uuidv7: no random source');
  const bytes = randomBytes ? randomBytes(16) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  let timestamp = BigInt(now);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
