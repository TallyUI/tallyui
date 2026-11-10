// Ported from WCPOS v2 packages/receipt-renderer/src/render-template.ts (monorepo main 5ac185b0, MIT).
// Uses object data; barcode resolution and SVG sanitization options omitted.
import Mustache from 'mustache';
import { parseXml } from './parse-xml';
import { renderHtml } from './render-html';
import { sanitizeHtml } from './sanitize-html';
import type { SanitizeHtmlOptions } from './sanitize-html';

export interface RenderSanitizeOptions extends SanitizeHtmlOptions {
  /** Disable sanitization only for trusted test/debug output. Defaults to true. */
  sanitize?: boolean;
}

/** Mustache only. */
export function renderReceiptTemplate(template: string, data: object): string {
  return Mustache.render(template, data);
}

/** Mustache HTML template, then sanitize (unless sanitize === false). No <barcode>/<qrcode> resolution. */
export function renderLogiclessTemplate(
  template: string, data: object, options: RenderSanitizeOptions = {},
): string {
  const html = Mustache.render(template, data);
  return options.sanitize === false ? html : sanitizeHtml(html, options);
}

/** Mustache, then parseXml, then renderHtml, then sanitize (unless sanitize === false). */
export function renderThermalPreview(
  template: string, data: object, options: RenderSanitizeOptions = {},
): string {
  const resolved = Mustache.render(template, data);
  const ast = parseXml(resolved);
  const html = renderHtml(ast);
  return options.sanitize === false ? html : sanitizeHtml(html, options);
}
