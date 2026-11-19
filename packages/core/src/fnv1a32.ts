/**
 * 32-bit FNV-1a over the string's UTF-16 code units (charCodeAt), as lowercase hex.
 * Platform apps derive persisted database names from it, so the output format is part of the contract:
 * `pad: true` left-pads to 8 hex digits, `pad: false` keeps the shortest form. An app keeps the form it already stores.
 */
export function fnv1a32(text: string, options: { pad: boolean }): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16);
  return options.pad ? hex.padStart(8, '0') : hex;
}
