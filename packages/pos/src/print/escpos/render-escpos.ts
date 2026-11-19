// After WCPOS v2 `receipt-renderer/src/render-escpos.ts` (monorepo main dfed181d1). Text is wrapped and aligned with
// spaces here, `ESC a` only wraps codes; row cells wrap (v2 truncates). Images are skipped; no `ESC 3` or `ESC !`.
import { parseXml } from '../../receipt-template/parse-xml';
import { renderReceiptTemplate } from '../../receipt-template/render-template';
import type { BarcodeNode, ColNode, DrawerConnector, QrcodeNode, ReceiptNode, ThermalNode } from '../../receipt-template/types';
import { foldText, resolveCodePage } from './code-page';
import { escpos, type EscPosBuilder } from './commands';
import { wrapText } from './encode';

export interface RenderEscposOptions {
  /** Characters per line at 1× width. Default: the template's `paperWidth`. */ columns?: number;
  /** A code page name for `resolveCodePage`. Default cp437. */ codePage?: string;
  /** Pulse the drawer when the template has no `<drawer>` node (v2 rule). Default false. */ openDrawer?: boolean;
  /** For `openDrawer` and for a `<drawer>` with no connector. Default 'pin2'. */ drawerConnector?: DrawerConnector;
}
interface Style { bold: boolean; underline: boolean; invert: boolean; width: number; height: number }
type Align = 'left' | 'center' | 'right';
const PLAIN: Style = { bold: false, underline: false, invert: false, width: 1, height: 1 };
/** v2 `collectTrailingControls`: the run of these ending the body follows the auto pulse and the style reset. */
const TRAILING = new Set<ThermalNode['type']>(['cut', 'feed', 'drawer']);
const BREAK = /\r\n|\r|\n/;
const leading = (text: string) => text.length - text.replace(/^ +/, '').length;

/** Print a parsed thermal template as ESC/POS bytes: `ESC @`, the code page, the body, then its trailing controls. */
export function renderEscpos(ast: ReceiptNode, options: RenderEscposOptions = {}): Uint8Array {
  const page = resolveCodePage(options.codePage);
  const columns = options.columns ?? ast.paperWidth;
  const connector = options.drawerConnector ?? 'pin2';
  const out = escpos(page).init().codePage();
  let [style, printed] = [PLAIN, PLAIN];
  let align: Align = 'left';
  let line: { text: string; style: Style }[] = [];
  // Lazy: only what changed since the last style sent.
  const sync = (next: Style) => {
    if (next.width !== printed.width || next.height !== printed.height) out.size(next.width, next.height);
    if (next.bold !== printed.bold) out.bold(next.bold);
    if (next.underline !== printed.underline) out.underline(next.underline);
    if (next.invert !== printed.invert) out.invert(next.invert);
    printed = next;
  };
  // One physical line: v2 `alignedPadding` as spaces, then each character in its own style, then LF.
  const emit = (text: string, styles: Style[], mode: Align, scale: number) => {
    const room = columns - text.length * scale;
    const pad = Math.floor((mode === 'center' ? Math.floor(room / 2) : mode === 'right' ? room : 0) / scale);
    if (text && pad > 0) { sync({ ...styles[0], underline: false, invert: false }); out.text(' '.repeat(pad)); }
    Array.from(text).forEach((char, i) => { sync(styles[i]); out.text(char); });
    out.text('\n');
  };
  // Ends the pending line (any line when forced). The indent repeats on wrapped lines, and a cursor maps each
  // output character back to its source character's style (`wrapText` only drops spaces).
  const endLine = (force: boolean) => {
    if (!force && !line.length) return;
    const text = line.map((run) => run.text).join('');
    const styles = line.flatMap((run) => Array.from(run.text, () => run.style));
    const scale = Math.max(1, ...line.map((run) => run.style.width));
    const indent = leading(text);
    line = [];
    let cursor = indent;
    for (const part of wrapText(text.slice(indent), Math.max(1, Math.floor(columns / scale) - indent))) {
      const partStyles = Array.from(part, (char) => { while (text[cursor] !== char) cursor++; return styles[cursor++]; });
      emit(' '.repeat(indent) + part, [...styles.slice(0, indent), ...partStyles], align, scale);
    }
  };
  const row = (cols: ColNode[]) => {
    const widths = rowWidths(cols, Math.floor(columns / style.width));
    const cells = cols.map((col, i) => {
      const text = foldText(extractText(col.children).split(BREAK).join(' '), page);
      const indent = col.align === 'left' ? Math.min(leading(text), widths[i] - 1) : 0;
      return wrapText(text.slice(leading(text)), widths[i] - indent).map((cell) =>
        col.align === 'left' ? (' '.repeat(indent) + cell).padEnd(widths[i]) : cell.padStart(widths[i]));
    });
    const height = Math.max(0, ...cells.map((cell) => cell.length));
    for (let r = 0; r < height; r++) {
      sync(style);
      out.text(cells.map((cell, i) => cell[r - height + cell.length] ?? ' '.repeat(widths[i])).join('') + '\n');
    }
  };
  // Validated on a scratch builder first (13a throws before pushing), so a rejected value leaves no `ESC a`.
  const code = (node: BarcodeNode | QrcodeNode) => {
    if (!node.value) return;
    const sym = node.type === 'qrcode' ? 'qrcode' : node.barcodeType.trim().toLowerCase();
    const print = (to: EscPosBuilder) => node.type === 'qrcode' ? to.qrcode(node.value, { size: node.size })
      : to.barcode(node.value, sym as 'code128' | 'ean13', { height: node.height, hri: 'below' });
    let native = sym === 'qrcode' || sym === 'code128' || sym === 'ean13';
    try { if (native) print(escpos(page)); } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      native = false;
    }
    if (native) { print(out.align(align)).align('left'); return; }
    emit(foldText(node.value, page), Array.from(node.value, () => style), 'center', style.width);
  };
  // Nested style and align nodes restore the context they found; an align ends its pending line inside.
  const within = (children: ThermalNode[], nextStyle: Style, nextAlign: Align, ends = false) => {
    const saved = [style, align] as const;
    [style, align] = [nextStyle, nextAlign];
    children.forEach(walk);
    if (ends) endLine(false);
    [style, align] = saved;
  };
  const walk = (node: ThermalNode): void => {
    switch (node.type) {
      case 'raw-text': return node.value.split(BREAK).forEach((part, i) => {
        if (i > 0) endLine(true);
        if (part) line.push({ text: foldText(part, page), style });
      });
      case 'text': node.children.forEach(walk); return endLine(true);
      case 'image': return;
      case 'receipt': case 'col': return node.children.forEach(walk);
      case 'size': return within(node.children, { ...style, width: node.width, height: node.height }, align);
      case 'bold': case 'underline': case 'invert': return within(node.children, { ...style, [node.type]: true }, align);
      case 'align': endLine(false); return within(node.children, style, node.mode, true);
    }
    endLine(false);
    switch (node.type) {
      case 'row': return row(node.children);
      case 'barcode': case 'qrcode': return code(node);
      case 'feed': out.text('\n'.repeat(node.lines)); return;
      case 'cut': out.cut(node.cutType); return;
      case 'drawer': out.pulse(node.connector ?? connector); return;
      case 'line':
        sync(style);
        out.text((node.style === 'dotted' ? '. '.repeat(Math.ceil(columns / 2)).slice(0, columns)
          : (node.style === 'double' ? '═' : '-').repeat(columns)) + '\n');
    }
  };
  const body = ast.children;
  let end = body.length;
  while (end > 0 && TRAILING.has(body[end - 1].type)) end--;
  body.slice(0, end).forEach(walk);
  endLine(false);
  if (options.openDrawer && !hasDrawer(body)) out.pulse(connector);
  sync(PLAIN);
  body.slice(end).forEach(walk);
  return out.bytes();
}

/** WCPOS v2's `encodeThermalTemplate`: Mustache (`renderReceiptTemplate`), then `parseXml`, then `renderEscpos`. */
export function encodeThermalTemplate(template: string, data: object, options?: RenderEscposOptions): Uint8Array {
  return renderEscpos(parseXml(renderReceiptTemplate(template, data)), options);
}

/** v2 `resolveThermalRowWidths`: the last `*` column takes the remainder; every `*` column is at least 1. */
function rowWidths(cols: ColNode[], columns: number): number[] {
  const fixed = cols.reduce((sum, col) => sum + (col.width === '*' ? 0 : col.width), 0);
  const stars = cols.filter((col) => col.width === '*').length;
  const remaining = Math.max(0, columns - fixed);
  const star = stars ? Math.floor(remaining / stars) : 0;
  let k = 0;
  return cols.map((col) => col.width !== '*' ? col.width : Math.max(1, star + (++k === stars ? remaining - star * stars : 0)));
}
/** v2 `extractText`: raw text as is, a node with children recursed, anything else empty. */
const extractText = (nodes: ThermalNode[]): string =>
  nodes.map((node) => node.type === 'raw-text' ? node.value : 'children' in node ? extractText(node.children) : '').join('');
const hasDrawer = (nodes: ThermalNode[]): boolean =>
  nodes.some((node) => node.type === 'drawer' || ('children' in node && hasDrawer(node.children)));
