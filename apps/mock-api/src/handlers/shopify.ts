import { Hono } from 'hono';
import { products } from '../data/catalog';
import { orders } from '../data/orders';
import { customers } from '../data/customers';
import { toShopifyProduct } from '../transforms/shopify';
import { toShopifyOrder } from '../transforms/orders';
import { toShopifyCustomer } from '../transforms/customers';
import { paginateCursor } from '../utils/pagination';

const shopifyProducts = products.map((p) => toShopifyProduct(p));
const shopifyOrders = orders.map((o) => toShopifyOrder(o));
const shopifyCustomers = customers.map((c) => toShopifyCustomer(c));

const app = new Hono();

app.get('/admin/api/2024-01/products.json', (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const pageInfo = c.req.query('page_info');
  const ids = c.req.query('ids');
  const updatedAtMin = c.req.query('updated_at_min');
  const fields = c.req.query('fields');

  let filtered = shopifyProducts;

  if (ids) {
    const idList = ids.split(',');
    filtered = filtered.filter((p) => idList.includes(p.id));
  }

  if (updatedAtMin) {
    const cutoff = new Date(updatedAtMin).getTime();
    filtered = filtered.filter(
      (p) => new Date(p.updated_at).getTime() >= cutoff
    );
  }

  const result = paginateCursor(
    filtered,
    { limit, afterCursor: pageInfo ?? undefined },
    (p) => p.id
  );

  const links: string[] = [];
  const baseUrl = new URL(c.req.url);
  if (result.hasNext && result.nextCursor) {
    baseUrl.searchParams.set('page_info', result.nextCursor);
    baseUrl.searchParams.set('limit', String(limit));
    links.push(`<${baseUrl.toString()}>; rel="next"`);
  }

  let items = result.items;
  if (fields) {
    const fieldList = fields.split(',').map((f) => f.trim());
    items = items.map((p) => {
      const picked: Record<string, any> = {};
      for (const f of fieldList) {
        if (f in p) picked[f] = (p as any)[f];
      }
      return picked as any;
    });
  }

  const headers: Record<string, string> = {};
  if (links.length > 0) headers['Link'] = links.join(', ');

  return c.json({ products: items }, 200, headers);
});

app.get('/admin/api/2024-01/products/:id.json', (c) => {
  const id = c.req.param('id');
  const product = shopifyProducts.find((p) => p.id === id);
  if (!product) return c.json({ errors: 'Not Found' }, 404);
  return c.json({ product });
});

app.post('/admin/api/2024-01/products.json', (c) => {
  return c.json(
    { product: { ...shopifyProducts[0], id: '9999999999' } },
    201
  );
});

app.put('/admin/api/2024-01/products/:id.json', async (c) => {
  const id = c.req.param('id');
  const product = shopifyProducts.find((p) => p.id === id);
  if (!product) return c.json({ errors: 'Not Found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  return c.json({ product: { ...product, ...(body as any).product } });
});

app.delete('/admin/api/2024-01/products/:id.json', (c) => {
  return c.body(null, 200);
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

app.get('/admin/api/2024-01/orders.json', (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const pageInfo = c.req.query('page_info');
  const fields = c.req.query('fields');

  const result = paginateCursor(
    shopifyOrders,
    { limit, afterCursor: pageInfo ?? undefined },
    (o) => o.id
  );

  const links: string[] = [];
  const baseUrl = new URL(c.req.url);
  if (result.hasNext && result.nextCursor) {
    baseUrl.searchParams.set('page_info', result.nextCursor);
    baseUrl.searchParams.set('limit', String(limit));
    links.push(`<${baseUrl.toString()}>; rel="next"`);
  }

  let items = result.items;
  if (fields) {
    const fieldList = fields.split(',').map((f) => f.trim());
    items = items.map((o) => {
      const picked: Record<string, any> = {};
      for (const f of fieldList) {
        if (f in o) picked[f] = (o as any)[f];
      }
      return picked as any;
    });
  }

  const headers: Record<string, string> = {};
  if (links.length > 0) headers['Link'] = links.join(', ');

  return c.json({ orders: items }, 200, headers);
});

app.get('/admin/api/2024-01/orders/:id.json', (c) => {
  const id = c.req.param('id');
  const order = shopifyOrders.find((o) => o.id === id);
  if (!order) return c.json({ errors: 'Not Found' }, 404);
  return c.json({ order });
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

app.get('/admin/api/2024-01/customers.json', (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const pageInfo = c.req.query('page_info');
  const fields = c.req.query('fields');

  const result = paginateCursor(
    shopifyCustomers,
    { limit, afterCursor: pageInfo ?? undefined },
    (cu) => cu.id
  );

  const links: string[] = [];
  const baseUrl = new URL(c.req.url);
  if (result.hasNext && result.nextCursor) {
    baseUrl.searchParams.set('page_info', result.nextCursor);
    baseUrl.searchParams.set('limit', String(limit));
    links.push(`<${baseUrl.toString()}>; rel="next"`);
  }

  let items = result.items;
  if (fields) {
    const fieldList = fields.split(',').map((f) => f.trim());
    items = items.map((cu) => {
      const picked: Record<string, any> = {};
      for (const f of fieldList) {
        if (f in cu) picked[f] = (cu as any)[f];
      }
      return picked as any;
    });
  }

  const headers: Record<string, string> = {};
  if (links.length > 0) headers['Link'] = links.join(', ');

  return c.json({ customers: items }, 200, headers);
});

app.get('/admin/api/2024-01/customers/:id.json', (c) => {
  const id = c.req.param('id');
  const customer = shopifyCustomers.find((cu) => cu.id === id);
  if (!customer) return c.json({ errors: 'Not Found' }, 404);
  return c.json({ customer });
});

export { app as shopifyHandler };
