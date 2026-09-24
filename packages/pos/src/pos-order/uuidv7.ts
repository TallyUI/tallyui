function format(ms: number, bytes: Uint8Array): string {
  let timestamp = BigInt(ms);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createUuidv7(options?: {
  now?: () => number;
  randomBytes?: (n: number) => Uint8Array;
}): () => string {
  let lastMs = -Infinity;
  let lastRand = 0n;
  return () => {
    const randomBytes = options?.randomBytes;
    if (!randomBytes && !globalThis.crypto?.getRandomValues) throw new Error('uuidv7: no random source');
    let ms = Math.max((options?.now ?? Date.now)(), lastMs);
    let rand = lastRand + 1n;
    if (ms === lastMs && rand === 2n ** 74n) ms = lastMs + 1;
    if (ms !== lastMs) {
      const bytes = randomBytes ? randomBytes(16) : globalThis.crypto.getRandomValues(new Uint8Array(16));
      rand = (BigInt(bytes[6] & 0x0f) << 8n) | BigInt(bytes[7]);
      rand = (rand << 6n) | BigInt(bytes[8] & 0x3f);
      for (let i = 9; i < 16; i++) rand = (rand << 8n) | BigInt(bytes[i]);
    }
    lastMs = ms;
    lastRand = rand;
    const bytes = new Uint8Array(16);
    for (let i = 15; i >= 9; i--) {
      bytes[i] = Number(rand & 0xffn);
      rand >>= 8n;
    }
    bytes[8] = Number(rand & 0x3fn);
    rand >>= 6n;
    bytes[7] = Number(rand & 0xffn);
    bytes[6] = Number(rand >> 8n);
    return format(ms, bytes);
  };
}

const monotonic = createUuidv7();

/** RFC 9562 UUIDv7: monotonic with no arguments; stateless with an explicit timestamp or random source. */
export function uuidv7(now?: number, randomBytes?: (n: number) => Uint8Array): string {
  if (now === undefined && randomBytes === undefined) return monotonic();
  const ms = now ?? Date.now();
  if (!randomBytes && !globalThis.crypto?.getRandomValues) throw new Error('uuidv7: no random source');
  return format(ms, randomBytes ? randomBytes(16) : globalThis.crypto.getRandomValues(new Uint8Array(16)));
}
