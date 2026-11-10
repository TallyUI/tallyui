/**
 * Character tables for ESC/POS text. WCPOS v2 (monorepo main) leaves the code page to
 * `@point-of-sale/receipt-printer-encoder`; here two fixed tables cover Latin receipts without a dependency.
 * `high` holds the characters for bytes 0x80-0xFF; `id` is the `ESC t n` table number.
 */
export const ESCPOS_CODE_PAGES = {
  cp437: {
    id: 0,
    high: 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀'
      + 'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0',
  },
  // PC850 with the euro sign at 0xD5.
  cp858: {
    id: 19,
    high: 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤'
      + 'ðÐÊËÈ€ÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´\u00AD±‗¾¶§÷¸°¨·¹³²■\u00A0',
  },
} as const;

export type EscPosCodePageName = keyof typeof ESCPOS_CODE_PAGES;
export interface EscPosCodePage { id: number; high: string }

/** The named page; cp437 (ESC/POS table 0, the usual default) when the name is absent or unknown. */
export function resolveCodePage(name?: string): EscPosCodePage {
  return ESCPOS_CODE_PAGES[name as EscPosCodePageName] ?? ESCPOS_CODE_PAGES.cp437;
}

const PRINTABLE_ASCII = /^[\x20-\x7E]$/;

/**
 * Text the page can print, one character for one, so `length` is the columns it takes. v2's
 * `normalizeThermalText` first (dashes and the minus sign to `-`, curly quotes to ASCII, no-break and thin
 * spaces to a space); then a character the page has stays; `×` becomes `x`; an accented letter outside the
 * page loses its accent (`ź` → `z`); anything else prints as `?`.
 */
export function foldText(text: string, page: EscPosCodePage): string {
  const normalized = text
    .replace(/[\u2010-\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u202F\u2009\u2007]/g, ' ');
  return Array.from(normalized, (char) => {
    if (char === '\n' || PRINTABLE_ASCII.test(char) || page.high.includes(char)) return char;
    if (char === '\u00D7') return 'x';
    const base = char.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
    return PRINTABLE_ASCII.test(base) ? base : '?';
  }).join('');
}
