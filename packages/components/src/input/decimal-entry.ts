// Port of WCPOS v2 (monorepo main) packages/components/src/lib/decimal-entry.ts and keypad/index.tsx's decimalRow; MIT, WCPOS.
import { DIGIT_ROWS, type KeypadKey } from './keypad';

export const BACKSPACE: KeypadKey = { name: 'backspace', label: 'Delete last digit', text: '⌫' };

/** v2's typeDecimal: `.` once and only with places, a digit past the places refused, a lone 0 replaced. */
export function typeDecimal(buffer: string, key: string, places: number): string {
  if (key === 'backspace') return buffer.slice(0, -1);
  if (key === 'decimal') return places > 0 && !buffer.includes('.') ? `${buffer || '0'}.` : buffer;
  if (!/^[0-9]$/.test(key)) return buffer;
  const point = buffer.indexOf('.');
  if (point >= 0) return buffer.length - point > places ? buffer : buffer + key;
  return buffer === '0' ? key : buffer + key;
}

/** `DIGIT_ROWS` and the last row: decimal point, 0 and backspace with places; a wide 0 and backspace without. */
export function decimalRows(places: number): KeypadKey[][] {
  return [...DIGIT_ROWS, places
    ? [{ name: 'decimal', label: 'Decimal point', text: '.' }, { name: '0', label: '0' }, BACKSPACE]
    : [{ name: '0', label: '0', span: 2 }, BACKSPACE]];
}
