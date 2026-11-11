import type { ReceiptTemplate, ReceiptTemplateKind, SyncContext } from '@tallyui/core';
import { checkResponse } from './replication/products';

type WooTemplateRow = {
  id?: unknown;
  title?: unknown;
  type?: unknown;
  engine?: unknown;
  content?: unknown;
  paper_width?: unknown;
  status?: unknown;
  is_virtual?: unknown;
  is_disabled?: unknown;
};

// WCPOS's offline-capable engines and the TallyUI renderer each maps to; legacy-php bodies run only on the server.
const WOO_ENGINES = { logicless: 'html', thermal: 'thermal' } as const;

/**
 * WCPOS wcpos/v2/templates: the store's templates of one kind, in the plugin's order (as v2's templates sync keeps it).
 * Only published or virtual, enabled rows with a body the till can render; all carry WCPOS's data model.
 */
export async function wooReceiptTemplates(context: SyncContext, kind: ReceiptTemplateKind = 'receipt'): Promise<ReceiptTemplate[]> {
  const response = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/templates${kind === 'receipt' ? '' : `?type=${kind}`}`, {
    method: 'GET', headers: context.headers, signal: context.signal,
  });
  if (response.status === 404) return [];
  if (!response.ok) {
    await checkResponse(response);
    throw new Error(`WooCommerce API error: ${response.status}`);
  }
  const rows: unknown = await response.json().catch(() => undefined);
  if (!Array.isArray(rows)) throw new Error('connector-woocommerce: unexpected templates response');

  const templates: ReceiptTemplate[] = [];
  const seen = new Set<string>();
  for (const row of rows as (WooTemplateRow | null)[]) {
    if (typeof row !== 'object' || row === null || row.type !== kind) continue;
    if (row.engine !== 'logicless' && row.engine !== 'thermal') continue;
    if (typeof row.content !== 'string' || row.content.length === 0) continue;
    if (row.is_disabled === true || (row.is_virtual !== true && row.status !== 'publish')) continue;
    if (!(typeof row.id === 'number' || (typeof row.id === 'string' && row.id.length > 0))) continue;
    if (typeof row.title !== 'string') continue;
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const engine = WOO_ENGINES[row.engine];
    const paper = engine === 'thermal' && (row.paper_width === '58mm' || row.paper_width === '80mm') ? row.paper_width : undefined;
    templates.push({
      id, kind, title: row.title, engine, body: row.content, ...(paper ? { paper } : {}), dataModel: 'wcpos',
    });
  }
  return templates;
}
