import { describe, it, expect } from 'vitest';
import { paginatePage, paginateOffset, paginateCursor } from '../utils/pagination';

const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

describe('paginatePage (WooCommerce style)', () => {
  it('returns first page', () => {
    const result = paginatePage(items, { page: 1, perPage: 10 });
    expect(result.items.length).toBe(10);
    expect(result.totalPages).toBe(3);
    expect(result.total).toBe(25);
  });

  it('returns last partial page', () => {
    const result = paginatePage(items, { page: 3, perPage: 10 });
    expect(result.items.length).toBe(5);
  });

  it('returns empty for out-of-range page', () => {
    const result = paginatePage(items, { page: 99, perPage: 10 });
    expect(result.items.length).toBe(0);
  });
});

describe('paginateOffset (Medusa style)', () => {
  it('returns correct slice', () => {
    const result = paginateOffset(items, { offset: 10, limit: 10 });
    expect(result.items.length).toBe(10);
    expect(result.items[0].id).toBe(11);
    expect(result.count).toBe(25);
  });

  it('handles offset beyond length', () => {
    const result = paginateOffset(items, { offset: 100, limit: 10 });
    expect(result.items.length).toBe(0);
  });
});

describe('paginateCursor (Shopify style)', () => {
  it('returns first page with next cursor', () => {
    const result = paginateCursor(items, { limit: 10 }, (item) => String(item.id));
    expect(result.items.length).toBe(10);
    expect(result.nextCursor).toBe('10');
    expect(result.hasPrevious).toBe(false);
    expect(result.hasNext).toBe(true);
  });

  it('returns page after cursor', () => {
    const result = paginateCursor(items, { limit: 10, afterCursor: '10' }, (item) => String(item.id));
    expect(result.items.length).toBe(10);
    expect(result.items[0].id).toBe(11);
    expect(result.hasPrevious).toBe(true);
  });

  it('returns last page', () => {
    const result = paginateCursor(items, { limit: 10, afterCursor: '20' }, (item) => String(item.id));
    expect(result.items.length).toBe(5);
    expect(result.hasNext).toBe(false);
  });
});
