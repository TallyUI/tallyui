// Ported from WCPOS v2 packages/receipt-renderer/src/sanitize-html.ts (monorepo main 5ac185b0, MIT).
// DOM walk retained; DOMPurify and xmldom paths omitted.
export interface SanitizeHtmlOptions {
  /** Additional tag names to allow beyond DOMPurify's default HTML profile. */
  addTags?: string[];
  /** Additional attribute names to allow beyond DOMPurify's default HTML profile. */
  addAttributes?: string[];
}

/**
 * Sanitize receipt HTML by walking the parsed DOM (v2's jsdom/SSR path).
 * v2's DOMPurify browser path and xmldom React Native path are not ported.
 * Without a global DOMParser, return escaped text.
 */
export function sanitizeHtml(html: string, options: SanitizeHtmlOptions = {}): string {
  if (typeof DOMParser === 'undefined') return escapeHtml(html);
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  const body = doc.body;
  sanitizeParsedBody(body, options);
  return body.innerHTML;
}

const URL_BEARING_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

/** Executable, document-control, remote-fetch and SVG/MathML tags stripped unless explicitly allow-listed. */
const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'style', 'link', 'meta', 'base', 'svg', 'math',
]);

function hasUnsafeProtocol(raw: string): boolean {
  // eslint-disable-next-line no-control-regex -- Strip control characters before checking URL protocols, as in v2.
  const normalized = raw.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  return normalized.startsWith('javascript:') || normalized.startsWith('vbscript:') || normalized.startsWith('data:');
}

/** Remove dangerous elements, event-handler attributes, and unsafe-protocol URLs from the parsed body. */
function sanitizeParsedBody(body: Element, options: SanitizeHtmlOptions): void {
  const allowedExtraTags = new Set((options.addTags ?? []).map((tag) => tag.toLowerCase()));
  const allowedExtraAttrs = new Set((options.addAttributes ?? []).map((attr) => attr.toLowerCase()));
  for (const el of Array.from(body.getElementsByTagName('*'))) {
    const tag = el.tagName.toLowerCase();
    if (DANGEROUS_TAGS.has(tag) && !allowedExtraTags.has(tag)) el.parentNode?.removeChild(el);
  }
  for (const el of Array.from(body.getElementsByTagName('*'))) {
    if (!el.attributes) continue;
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = (attr.value ?? '').trim();
      if (name.startsWith('on') && !allowedExtraAttrs.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_BEARING_ATTRIBUTES.has(name) && hasUnsafeProtocol(value)) el.removeAttribute(attr.name);
    }
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
