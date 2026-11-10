// Ported from WCPOS v2 packages/receipt-renderer/src/render-html.ts (monorepo main 5ac185b0, MIT).
// Barcode SVG generation and options omitted; codes render pending placeholders.
import type { ColNode, ReceiptNode, RowNode, ThermalNode } from './types';

// 80mm paper at 203 DPI prints ~576 dots wide; 58mm prints ~384 dots.
// The AST gives character width: anything >= 40 chars is treated as 80mm.
const DOT_BUDGET_WIDE = 576;
const DOT_BUDGET_NARROW = 384;
const NARROW_PAPER_THRESHOLD_CHARS = 40;

export function renderHtml(ast: ReceiptNode): string {
  const widthChars = safeInteger(ast.paperWidth, 48, 16, 120);
  const inner = renderNodes(ast.children, widthChars);
  return `<div style="width: ${widthChars}ch; font-family: 'Courier New', Courier, monospace; font-size: 13px; ` +
    'line-height: 1.4; background: #fff; color: #000; padding: 16px 12px; overflow: hidden; ' +
    `white-space: pre-wrap; overflow-wrap: anywhere;">${inner}</div>`;
}

function renderNodes(nodes: ThermalNode[], widthChars: number): string {
  return nodes.map((node) => renderNode(node, widthChars)).join('');
}

function renderNode(node: ThermalNode, widthChars: number): string {
  switch (node.type) {
    case 'raw-text':
      return escapeHtml(node.value);
    case 'text':
      return `<div>${renderNodes(node.children, widthChars)}</div>`;
    case 'bold':
      return `<strong>${renderNodes(node.children, widthChars)}</strong>`;
    case 'underline':
      return `<span style="text-decoration: underline">${renderNodes(node.children, widthChars)}</span>`;
    case 'invert':
      // Inline-block keeps block <text> children from collapsing the reversed background to zero width.
      return '<span style="display: inline-block; background: #000; color: #fff; padding: 0 4px">' +
        `${renderNodes(node.children, widthChars)}</span>`;
    case 'size':
      return `<span style="font-size: ${safeFloat(node.width, 1, 0.5, 8)}em; line-height: 1.2">` +
        `${renderNodes(node.children, widthChars)}</span>`;
    case 'align':
      return `<div style="text-align: ${safeAlign(node.mode)}">${renderNodes(node.children, widthChars)}</div>`;
    case 'row':
      return renderRow(node, widthChars);
    case 'col':
      return renderCol(node, widthChars);
    case 'line':
      if (node.style === 'double') return '<hr style="border: none; border-top: 3px double #000; margin: 4px 0" />';
      if (node.style === 'dashed') return '<hr style="border: none; border-top: 1px dashed #000; margin: 4px 0" />';
      if (node.style === 'dotted') return '<hr style="border: none; border-top: 1px dotted #000; margin: 4px 0" />';
      return '<hr style="border: none; border-top: 1px solid #000; margin: 4px 0" />';
    case 'barcode':
      return pendingCode(isQrBarcodeType(node.barcodeType) ? 'qrcode' : 'barcode', node.value);
    case 'qrcode':
      return pendingCode('qrcode', node.value);
    case 'image': {
      const safeSrc = safeImageSrc(node.src);
      if (!safeSrc) return '';
      const widthDots = safeInteger(node.width, 200, 1, 2000);
      const widthCh = dotsToCh(widthDots, widthChars);
      return `<div style="text-align: center; padding: 8px 0"><img src="${safeSrc}" ` +
        `style="width: min(100%, ${widthCh.toFixed(2)}ch); height: auto" /></div>`;
    }
    case 'cut':
      return '<div style="border-top: 1px dashed #ccc; margin: 12px 0; position: relative">' +
        '<span style="position: absolute; top: -8px; left: -4px; font-size: 14px">&#9986;</span></div>';
    case 'feed':
      return `<div style="height: ${safeInteger(node.lines, 1, 1, 50) * 1.4}em"></div>`;
    case 'drawer':
      return '';
    case 'receipt':
      return renderNodes(node.children, widthChars);
    default:
      return '';
  }
}

function pendingCode(kind: 'barcode' | 'qrcode', value: string): string {
  const text = value.trim();
  if (!text) return '';
  const safeKind = kind === 'qrcode' ? 'qrcode' : 'barcode';
  return `<div data-barcode-kind="${safeKind}" data-barcode-value="${escapeHtml(text)}" ` +
    'data-barcode-pending="true" style="text-align: center; padding: 8px 0">' +
    `<code>${escapeHtml(text)}</code></div>`;
}

function renderRow(node: RowNode, widthChars: number): string {
  const cols = node.children.map((col) => renderCol(col, widthChars)).join('');
  return `<div style="display: flex">${cols}</div>`;
}

function renderCol(node: ColNode, widthChars: number): string {
  const flex = node.width === '*' ? 'flex: 1' : `flex: 0 0 ${safeInteger(node.width, 12, 1, 120)}ch`;
  return `<span style="${flex}; text-align: ${safeAlign(node.align)}; overflow: hidden">` +
    `${renderNodes(node.children, widthChars)}</span>`;
}

function safeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function safeFloat(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function safeAlign(value: unknown): 'left' | 'center' | 'right' {
  return value === 'left' || value === 'center' || value === 'right' ? value : 'left';
}

function isQrBarcodeType(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return normalized === 'qrcode' || normalized === 'qr';
}

/** Convert printer dots to ch units relative to the receipt's character width. */
function dotsToCh(dots: number, paperWidthChars: number): number {
  const dotBudget = paperWidthChars >= NARROW_PAPER_THRESHOLD_CHARS ? DOT_BUDGET_WIDE : DOT_BUDGET_NARROW;
  return (dots * paperWidthChars) / dotBudget;
}

function safeImageSrc(src: unknown): string {
  if (typeof src !== 'string') return '';
  const value = src.trim();
  const isHttpUrl = /^https?:\/\//i.test(value);
  const isSafeDataUri = /^data:image\/(?:png|jpe?g|gif);base64,[A-Za-z0-9+/=]+$/i.test(value);
  const isSafeRootRelative = isSafeRootRelativeImageSrc(value);
  return isHttpUrl || isSafeDataUri || isSafeRootRelative ? escapeHtml(value) : '';
}

function isSafeRootRelativeImageSrc(value: string): boolean {
  if (value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  const path = value.split(/[?#]/, 1)[0];
  const suffix = value.slice(path.length);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (decodedPath.includes('\\')) return false;
  const segments = decodedPath.split('/');
  if (segments.includes('..') || segments.includes('.')) return false;
  return /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(path) &&
    (suffix === '' || /^[?#][A-Za-z0-9._~!$&'()*+,;=:@%/?#-]+$/.test(suffix));
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
