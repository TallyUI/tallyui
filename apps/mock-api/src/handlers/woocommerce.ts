import { Hono } from 'hono';
import { products } from '../data/catalog';
import { orders } from '../data/orders';
import { customers } from '../data/customers';
import { toWooProduct } from '../transforms/woocommerce';
import { toWooOrder } from '../transforms/orders';
import { toWooCustomer } from '../transforms/customers';
import { paginatePage } from '../utils/pagination';

const wooProducts = products.map((p, i) => toWooProduct(p, i + 1));
const wooOrders = orders.map((o, i) => toWooOrder(o, i + 1));
const wooCustomers = customers.map((c, i) => toWooCustomer(c, i + 1));

const app = new Hono();

// List products
app.get('/wp-json/wc/v3/products', (c) => {
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const perPage = parseInt(c.req.query('per_page') ?? '10', 10);
  const modifiedAfter = c.req.query('modified_after');
  const include = c.req.query('include');

  let filtered = wooProducts;

  if (modifiedAfter) {
    const cutoff = new Date(modifiedAfter).getTime();
    filtered = filtered.filter(
      (p) => new Date(p.date_modified_gmt).getTime() > cutoff
    );
  }

  if (include) {
    const ids = include.split(',').map(Number);
    filtered = filtered.filter((p) => ids.includes(p.id));
  }

  const result = paginatePage(filtered, { page, perPage });

  return c.json(result.items, 200, {
    'X-WP-Total': String(result.total),
    'X-WP-TotalPages': String(result.totalPages),
  });
});

// Single product
app.get('/wp-json/wc/v3/products/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const product = wooProducts.find((p) => p.id === id);
  if (!product)
    return c.json({ code: 'not_found', message: 'Product not found' }, 404);
  return c.json(product);
});

// Simulated writes
app.post('/wp-json/wc/v3/products', (c) => {
  return c.json({ ...wooProducts[0], id: 9999 }, 201);
});

app.put('/wp-json/wc/v3/products/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const product = wooProducts.find((p) => p.id === id);
  if (!product)
    return c.json({ code: 'not_found', message: 'Product not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  return c.json({ ...product, ...body });
});

app.delete('/wp-json/wc/v3/products/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const product = wooProducts.find((p) => p.id === id);
  if (!product)
    return c.json({ code: 'not_found', message: 'Product not found' }, 404);
  return c.json({ ...product, status: 'trash' });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

// List orders
app.get('/wp-json/wc/v3/orders', (c) => {
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const perPage = parseInt(c.req.query('per_page') ?? '10', 10);
  const modifiedAfter = c.req.query('modified_after');
  const include = c.req.query('include');

  let filtered = wooOrders;

  if (modifiedAfter) {
    const cutoff = new Date(modifiedAfter).getTime();
    filtered = filtered.filter(
      (o) => new Date(o.date_modified_gmt).getTime() > cutoff
    );
  }

  if (include) {
    const ids = include.split(',').map(Number);
    filtered = filtered.filter((o) => ids.includes(o.id));
  }

  const result = paginatePage(filtered, { page, perPage });

  return c.json(result.items, 200, {
    'X-WP-Total': String(result.total),
    'X-WP-TotalPages': String(result.totalPages),
  });
});

// Single order
app.get('/wp-json/wc/v3/orders/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const order = wooOrders.find((o) => o.id === id);
  if (!order)
    return c.json({ code: 'not_found', message: 'Order not found' }, 404);
  return c.json(order);
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

// List customers
app.get('/wp-json/wc/v3/customers', (c) => {
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const perPage = parseInt(c.req.query('per_page') ?? '10', 10);
  const include = c.req.query('include');

  let filtered = wooCustomers;

  if (include) {
    const ids = include.split(',').map(Number);
    filtered = filtered.filter((cu) => ids.includes(cu.id));
  }

  const result = paginatePage(filtered, { page, perPage });

  return c.json(result.items, 200, {
    'X-WP-Total': String(result.total),
    'X-WP-TotalPages': String(result.totalPages),
  });
});

// Single customer
app.get('/wp-json/wc/v3/customers/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const customer = wooCustomers.find((cu) => cu.id === id);
  if (!customer)
    return c.json({ code: 'not_found', message: 'Customer not found' }, 404);
  return c.json(customer);
});

export { app as woocommerceHandler };
