import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

app.get('/', (c) => {
  return c.json({
    name: '@tallyui/mock-api',
    description: 'Mock ecommerce API server for TallyUI demos and tests',
    platforms: ['woocommerce', 'medusa', 'shopify', 'vendure'],
  });
});

export default app;
