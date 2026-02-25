import { Hono } from 'hono';
import { products } from '../data/catalog';
import { orders } from '../data/orders';
import { customers } from '../data/customers';
import { toMedusaProduct } from '../transforms/medusa';
import { toMedusaOrder } from '../transforms/orders';
import { toMedusaCustomer } from '../transforms/customers';
import { paginateOffset } from '../utils/pagination';

const medusaProducts = products.map(toMedusaProduct);
const medusaOrders = orders.map(toMedusaOrder);
const medusaCustomers = customers.map(toMedusaCustomer);

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

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

app.get('/admin/orders', (c) => {
  const offset = parseInt(c.req.query('offset') ?? '0', 10);
  const limit = parseInt(c.req.query('limit') ?? '20', 10);

  const result = paginateOffset(medusaOrders, { offset, limit });

  return c.json({
    orders: result.items,
    count: result.count,
    offset: result.offset,
    limit: result.limit,
  });
});

app.get('/admin/orders/:id', (c) => {
  const id = c.req.param('id');
  const order = medusaOrders.find((o) => o.id === id);
  if (!order) return c.json({ message: 'Order not found' }, 404);
  return c.json({ order });
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

app.get('/admin/customers', (c) => {
  const offset = parseInt(c.req.query('offset') ?? '0', 10);
  const limit = parseInt(c.req.query('limit') ?? '20', 10);

  const result = paginateOffset(medusaCustomers, { offset, limit });

  return c.json({
    customers: result.items,
    count: result.count,
    offset: result.offset,
    limit: result.limit,
  });
});

app.get('/admin/customers/:id', (c) => {
  const id = c.req.param('id');
  const customer = medusaCustomers.find((cu) => cu.id === id);
  if (!customer) return c.json({ message: 'Customer not found' }, 404);
  return c.json({ customer });
});

export { app as medusaHandler };
