import { Hono } from 'hono';
import { products } from '../data/catalog';
import { toMedusaProduct } from '../transforms/medusa';
import { paginateOffset } from '../utils/pagination';

const medusaProducts = products.map(toMedusaProduct);

const app = new Hono();

app.get('/admin/products', (c) => {
  const offset = parseInt(c.req.query('offset') ?? '0', 10);
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const updatedAtGte = c.req.query('updated_at[gte]');

  let filtered = medusaProducts;

  if (updatedAtGte) {
    const cutoff = new Date(updatedAtGte).getTime();
    filtered = filtered.filter(
      (p) => p.updated_at && new Date(p.updated_at).getTime() >= cutoff
    );
  }

  const result = paginateOffset(filtered, { offset, limit });

  return c.json({
    products: result.items,
    count: result.count,
    offset: result.offset,
    limit: result.limit,
  });
});

app.get('/admin/products/:id', (c) => {
  const id = c.req.param('id');
  const product = medusaProducts.find((p) => p.id === id);
  if (!product) return c.json({ message: 'Product not found' }, 404);
  return c.json({ product });
});

app.post('/admin/products', (c) => {
  return c.json(
    { product: { ...medusaProducts[0], id: 'prod_new_001' } },
    201
  );
});

app.post('/admin/products/:id', async (c) => {
  const id = c.req.param('id');
  const product = medusaProducts.find((p) => p.id === id);
  if (!product) return c.json({ message: 'Product not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  return c.json({ product: { ...product, ...body } });
});

app.delete('/admin/products/:id', (c) => {
  return c.json({ id: c.req.param('id'), object: 'product', deleted: true });
});

export { app as medusaHandler };
