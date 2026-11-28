import { ConnectorUnauthorizedError, CustomerServiceError, decideProductEdit, type ProductEdit, type ProductEditTarget, type SyncContext } from '@tallyui/core';
import { medusaMajor, medusaMinor } from './money';

type Price = { id: string; amount: number; currency_code: string; min_quantity?: number | null; max_quantity?: number | null; rules?: Record<string, unknown> };
type Variant = { id: string; prices: Price[] };
type Preference = { attribute: string; value: string; is_tax_inclusive: boolean };

async function request(context: SyncContext, path: string, body?: { prices: { id: string; amount?: number }[] }) {
  const init = body ? { method: 'POST', headers: { ...context.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET', headers: context.headers };
  let response: Response;
  try {
    response = await (context.fetch ?? fetch)(`${context.baseUrl}/admin/${path}`, { ...init, signal: context.signal });
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error);
    throw new CustomerServiceError('network', message);
  }
  if (response.status === 401 || (!body && response.status === 403)) {
    throw new ConnectorUnauthorizedError(`Medusa rejected the credentials (HTTP ${response.status})`, response.status as 401 | 403);
  }
  return response;
}

function unexpected(response: Response) {
  return new CustomerServiceError('server', 'unexpected response', { status: response.status });
}

async function json(response: Response) {
  if (!response.ok) throw new CustomerServiceError('server', `HTTP ${response.status}`, { status: response.status });
  try { return await response.json(); } catch { throw unexpected(response); }
}

async function readVariant(response: Response, id: string): Promise<Variant | undefined> {
  const variants: Variant[] = (await json(response))?.product?.variants;
  if (!Array.isArray(variants)) throw unexpected(response);
  const variant = variants.find(entry => entry.id === id);
  if (variant && (!Array.isArray(variant.prices) || variant.prices.some(price => !price?.id || typeof price.currency_code !== 'string'))) throw unexpected(response);
  return variant;
}

async function priceListIds(context: SyncContext) {
  const ids = new Set<string>();
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const response = await request(context, `price-lists?fields=id,prices.id&limit=100&offset=${offset}`);
    const body = await json(response);
    if (!Array.isArray(body?.price_lists) || !Number.isSafeInteger(body.count)) throw unexpected(response);
    for (const list of body.price_lists) {
      if (!Array.isArray(list?.prices)) throw unexpected(response);
      for (const price of list.prices) {
        if (!price?.id) throw unexpected(response);
        ids.add(price.id);
      }
    }
    offset += body.price_lists.length;
    if (offset >= body.count) return ids;
  }
  throw new CustomerServiceError('server', 'too many price lists');
}

async function pricePreferences(context: SyncContext): Promise<Preference[]> {
  const response = await request(context, 'price-preferences?limit=1000');
  const body = await json(response);
  const preferences = body?.price_preferences;
  if (!Array.isArray(preferences)) throw unexpected(response);
  if (typeof body.count === 'number' && body.count > preferences.length) throw new CustomerServiceError('server', 'too many price preferences');
  return preferences;
}

function bind(variant: Variant, context: SyncContext, listIds: Set<string>, preferences: Preference[]) {
  const currency = context.pricingContext?.currency_code;
  if (!currency) return null;
  const defaults = variant.prices.filter(price => !listIds.has(price.id));
  const unruled = defaults.filter(price => price.currency_code.toLowerCase() === currency.toLowerCase() &&
    typeof price.rules === 'object' && price.rules !== null && !Array.isArray(price.rules) && !Object.keys(price.rules).length);
  const candidate = unruled[0];
  if (unruled.length !== 1 || candidate.min_quantity !== null || candidate.max_quantity !== null) return null;
  const amount = medusaMinor(candidate.amount, currency);
  if (!Number.isSafeInteger(amount) || medusaMajor(amount, currency) !== candidate.amount) return null;
  const taxInclusive = preferences.find(pref => pref.attribute === 'currency_code' && pref.value.toLowerCase() === currency.toLowerCase())?.is_tax_inclusive ?? false;
  const region = preferences.find(pref => pref.attribute === 'region_id' && pref.value.toLowerCase() === context.pricingContext?.region_id?.toLowerCase());
  if (region && region.is_tax_inclusive !== taxInclusive) return null;
  return { defaults, candidate, snapshot: { basePrice: { amount, currency: currency.toUpperCase(), taxInclusive } } };
}

async function readBound(context: SyncContext, target: ProductEditTarget) {
  if (!target.variantId) return null;
  const path = `products/${encodeURIComponent(target.productId)}`;
  const response = await request(context, path);
  if (response.status === 404) return null;
  const variant = await readVariant(response, target.variantId);
  if (!variant) return null;
  const [listIds, preferences] = await Promise.all([priceListIds(context), pricePreferences(context)]);
  const bound = bind(variant, context, listIds, preferences);
  return bound && { ...bound, listIds, preferences, path: `${path}/variants/${encodeURIComponent(variant.id)}`, variantId: variant.id };
}

export const medusaProductEdit: ProductEdit = {
  async read(context, target) { return (await readBound(context, target))?.snapshot ?? null; },
  async update(context, target, change) {
    const bound = await readBound(context, target);
    const decision = decideProductEdit(change, bound?.snapshot ?? null);
    if ('status' in decision) return decision;
    if (!bound || change.field !== 'basePrice') throw new CustomerServiceError('server', 'unexpected write decision');
    const currency = bound.snapshot.basePrice.currency;
    const major = medusaMajor(change.to, currency);
    if (medusaMinor(JSON.parse(JSON.stringify(major)), currency) !== change.to) return { status: 'refused', code: 'invalid' };
    const prices = bound.defaults.map(({ id }) => id === bound.candidate.id ? { id, amount: major } : { id });
    const response = await request(context, bound.path, { prices });
    if (response.status === 400) {
      const message = (await response.json().catch(() => null))?.message;
      return { status: 'refused', code: 'invalid', ...(typeof message === 'string' ? { message } : {}) };
    }
    if (response.status === 403) return { status: 'refused', code: 'forbidden' };
    if (response.status === 404) return { status: 'refused', code: 'not_found' };
    const variant = await readVariant(response, bound.variantId);
    const saved = variant && bind(variant, context, bound.listIds, bound.preferences);
    if (!saved) throw unexpected(response);
    return { status: 'saved', snapshot: saved.snapshot };
  },
};
