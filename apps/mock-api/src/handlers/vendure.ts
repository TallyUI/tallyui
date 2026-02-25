import { Hono } from 'hono';
import { products } from '../data/catalog';
import { toVendureProduct } from '../transforms/vendure';

const vendureProducts = products.map(toVendureProduct);

const app = new Hono();

app.post('/shop-api', async (c) => {
  const body = await c.req.json();
  const { query, variables } = body;

  if (query.includes('products')) {
    return handleProductList(c, variables);
  }

  if (query.includes('product(') || query.includes('product (')) {
    return handleSingleProduct(c, variables);
  }

  return c.json({ errors: [{ message: 'Unknown query' }] }, 400);
});

app.get('/shop-api', (c) => {
  return c.json({
    data: {
      __schema: {
        types: [{ name: 'Product' }, { name: 'ProductList' }],
      },
    },
  });
});

function handleProductList(c: any, variables: any = {}) {
  const take = variables?.options?.take ?? 100;
  const skip = variables?.options?.skip ?? 0;
  const afterDate = variables?.options?.filter?.updatedAt?.after;

  let filtered = vendureProducts;

  if (afterDate) {
    const cutoff = new Date(afterDate).getTime();
    filtered = filtered.filter(
      (p) => new Date(p.updatedAt).getTime() > cutoff
    );
  }

  const items = filtered.slice(skip, skip + take);

  return c.json({
    data: {
      products: {
        items,
        totalItems: filtered.length,
      },
    },
  });
}

function handleSingleProduct(c: any, variables: any = {}) {
  const id = variables?.id ?? variables?.slug;
  const product = vendureProducts.find((p) => p.id === id || p.slug === id);

  if (!product) {
    return c.json({ data: { product: null } });
  }

  return c.json({ data: { product } });
}

export { app as vendureHandler };
