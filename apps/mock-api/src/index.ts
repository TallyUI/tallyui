import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { woocommerceHandler } from './handlers/woocommerce';
import { medusaHandler } from './handlers/medusa';
import { shopifyHandler } from './handlers/shopify';
import { vendureHandler } from './handlers/vendure';

const app = new Hono();

app.use('*', cors());

app.get('/', (c) => {
  return c.json({
    name: '@tallyui/mock-api',
    description: 'Mock ecommerce API server for TallyUI demos and tests',
    platforms: ['woocommerce', 'medusa', 'shopify', 'vendure'],
  });
});

app.route('/woocommerce', woocommerceHandler);
app.route('/medusa', medusaHandler);
app.route('/shopify', shopifyHandler);
app.route('/vendure', vendureHandler);

export default app;
