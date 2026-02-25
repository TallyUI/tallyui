import { Hono } from 'hono';
import { products } from '../data/catalog';
import { orders } from '../data/orders';
import { customers } from '../data/customers';
import { toVendureProduct } from '../transforms/vendure';
import { toVendureOrder } from '../transforms/orders';
import { toVendureCustomer } from '../transforms/customers';

const vendureProducts = products.map(toVendureProduct);
const vendureOrders = orders.map(toVendureOrder);
const vendureCustomers = customers.map(toVendureCustomer);

const app = new Hono();

app.post('/shop-api', async (c) => {
  const body = await c.req.json();
  const { query, variables } = body;

  // Product queries
  if (query.includes('products')) {
    return handleProductList(c, variables);
  }
  if (query.includes('product(') || query.includes('product (')) {
    return handleSingleProduct(c, variables);
  }

  // Order queries
  if (query.includes('orders')) {
    return handleOrderList(c, variables);
  }
  if (query.includes('order(') || query.includes('order (')) {
    return handleSingleOrder(c, variables);
  }

  // Customer queries
  if (query.includes('customers')) {
    return handleCustomerList(c, variables);
  }
  if (query.includes('customer(') || query.includes('customer (')) {
    return handleSingleCustomer(c, variables);
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

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function handleOrderList(c: any, variables: any = {}) {
  const take = variables?.options?.take ?? 100;
  const skip = variables?.options?.skip ?? 0;

  const items = vendureOrders.slice(skip, skip + take);

  return c.json({
    data: {
      orders: {
        items,
        totalItems: vendureOrders.length,
      },
    },
  });
}

function handleSingleOrder(c: any, variables: any = {}) {
  const id = variables?.id ?? variables?.code;
  const order = vendureOrders.find((o) => o.id === id || o.code === id);

  if (!order) {
    return c.json({ data: { order: null } });
  }

  return c.json({ data: { order } });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

function handleCustomerList(c: any, variables: any = {}) {
  const take = variables?.options?.take ?? 100;
  const skip = variables?.options?.skip ?? 0;

  const items = vendureCustomers.slice(skip, skip + take);

  return c.json({
    data: {
      customers: {
        items,
        totalItems: vendureCustomers.length,
      },
    },
  });
}

function handleSingleCustomer(c: any, variables: any = {}) {
  const id = variables?.id;
  const customer = vendureCustomers.find(
    (cu) => cu.id === id || cu.emailAddress === id
  );

  if (!customer) {
    return c.json({ data: { customer: null } });
  }

  return c.json({ data: { customer } });
}

export { app as vendureHandler };
