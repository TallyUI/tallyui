import { describe, it, expect } from 'vitest';
import { orders } from '../data/orders';
import { customers } from '../data/customers';

describe('order data', () => {
  it('has at least 10 orders', () => {
    expect(orders.length).toBeGreaterThanOrEqual(10);
  });

  it('covers all order statuses', () => {
    const statuses = new Set(orders.map((o) => o.status));
    expect(statuses).toContain('pending');
    expect(statuses).toContain('processing');
    expect(statuses).toContain('completed');
    expect(statuses).toContain('refunded');
    expect(statuses).toContain('cancelled');
  });

  it('every order has line items', () => {
    for (const o of orders) {
      expect(o.lineItems.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('order totals are consistent', () => {
    for (const o of orders) {
      const lineTotal = o.lineItems.reduce((sum, li) => sum + li.total, 0);
      expect(o.subtotal).toBe(lineTotal);
      expect(o.total).toBe(o.subtotal + o.tax);
    }
  });
});

describe('customer data', () => {
  it('has at least 5 customers', () => {
    expect(customers.length).toBeGreaterThanOrEqual(5);
  });

  it('every customer has required fields', () => {
    for (const c of customers) {
      expect(c.email).toContain('@');
      expect(c.firstName).toBeTruthy();
      expect(c.lastName).toBeTruthy();
    }
  });

  it('has international addresses', () => {
    const countries = new Set(customers.map((c) => c.address.country));
    expect(countries.size).toBeGreaterThanOrEqual(3);
  });
});
