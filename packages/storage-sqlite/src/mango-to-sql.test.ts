import { describe, it, expect } from 'vitest';
import { mangoQueryToSQL, buildQuerySQL, buildCountSQL } from './mango-to-sql';
import type { FilledMangoQuery } from 'rxdb';

function makeQuery(overrides: Partial<FilledMangoQuery<any>> = {}): FilledMangoQuery<any> {
  return {
    selector: {},
    sort: [],
    skip: 0,
    ...overrides,
  };
}

describe('mangoQueryToSQL', () => {
  describe('basic selectors', () => {
    it('should produce WHERE with only _deleted filter for empty selector', () => {
      const result = mangoQueryToSQL(makeQuery());
      expect(result.where).toBe(`WHERE json_extract(data, '$._deleted') = 0`);
      expect(result.params).toEqual([]);
    });

    it('should handle equality ($eq) for a field', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { name: 'Alice' } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.name') = ?`);
      expect(result.params).toContain('Alice');
    });

    it('should handle explicit $eq operator', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { name: { $eq: 'Alice' } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.name') = ?`);
      expect(result.params).toEqual(['Alice']);
    });
  });

  describe('comparison operators', () => {
    it('should handle $gt', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { age: { $gt: 25 } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.age') > ?`);
      expect(result.params).toContain(25);
    });

    it('should handle $gte', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { age: { $gte: 25 } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.age') >= ?`);
      expect(result.params).toContain(25);
    });

    it('should handle $lt', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { age: { $lt: 30 } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.age') < ?`);
      expect(result.params).toContain(30);
    });

    it('should handle $lte', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { age: { $lte: 30 } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.age') <= ?`);
      expect(result.params).toContain(30);
    });

    it('should handle $ne', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { status: { $ne: 'inactive' } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.status') != ?`);
      expect(result.params).toContain('inactive');
    });
  });

  describe('array operators', () => {
    it('should handle $in', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { status: { $in: ['active', 'pending'] } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.status') IN (?, ?)`);
      expect(result.params).toEqual(['active', 'pending']);
    });

    it('should handle empty $in as always-false', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { status: { $in: [] } } as any,
      }));
      expect(result.where).toContain('0');
    });

    it('should handle $nin', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { status: { $nin: ['deleted', 'archived'] } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.status') NOT IN (?, ?)`);
      expect(result.params).toEqual(['deleted', 'archived']);
    });
  });

  describe('regex', () => {
    it('should convert $regex to LIKE with wildcards', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { name: { $regex: '^Al' } } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.name') LIKE ?`);
      expect(result.params).toContain('Al%');
    });

    it('should handle unanchored regex with wrapping wildcards', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { name: { $regex: 'lic' } } as any,
      }));
      expect(result.params).toContain('%lic%');
    });

    it('should handle end-anchored regex', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: { name: { $regex: 'ice$' } } as any,
      }));
      expect(result.params).toContain('%ice');
    });
  });

  describe('logical operators', () => {
    it('should handle $and', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: {
          $and: [
            { age: { $gte: 18 } },
            { age: { $lte: 65 } },
          ],
        } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.age') >= ?`);
      expect(result.where).toContain(`json_extract(data, '$.age') <= ?`);
      expect(result.where).toContain(' AND ');
      expect(result.params).toEqual([18, 65]);
    });

    it('should handle $or', () => {
      const result = mangoQueryToSQL(makeQuery({
        selector: {
          $or: [
            { name: 'Alice' },
            { name: 'Bob' },
          ],
        } as any,
      }));
      expect(result.where).toContain(`json_extract(data, '$.name') = ?`);
      expect(result.where).toContain(' OR ');
      expect(result.params).toEqual(['Alice', 'Bob']);
    });
  });

  describe('sort', () => {
    it('should generate ORDER BY clause for ascending', () => {
      const result = mangoQueryToSQL(makeQuery({
        sort: [{ name: 'asc' }] as any,
      }));
      expect(result.orderBy).toBe(`ORDER BY json_extract(data, '$.name') ASC`);
    });

    it('should generate ORDER BY clause for descending', () => {
      const result = mangoQueryToSQL(makeQuery({
        sort: [{ age: 'desc' }] as any,
      }));
      expect(result.orderBy).toBe(`ORDER BY json_extract(data, '$.age') DESC`);
    });

    it('should handle multiple sort fields', () => {
      const result = mangoQueryToSQL(makeQuery({
        sort: [{ name: 'asc' }, { age: 'desc' }] as any,
      }));
      expect(result.orderBy).toBe(
        `ORDER BY json_extract(data, '$.name') ASC, json_extract(data, '$.age') DESC`
      );
    });
  });

  describe('limit and skip', () => {
    it('should generate LIMIT clause', () => {
      const result = mangoQueryToSQL(makeQuery({ limit: 10 }));
      expect(result.limit).toBe('LIMIT ?');
      expect(result.limitParams).toEqual([10]);
    });

    it('should generate LIMIT + OFFSET for skip', () => {
      const result = mangoQueryToSQL(makeQuery({ limit: 10, skip: 5 }));
      expect(result.limit).toBe('LIMIT ? OFFSET ?');
      expect(result.limitParams).toEqual([10, 5]);
    });

    it('should generate LIMIT -1 OFFSET for skip without limit', () => {
      const result = mangoQueryToSQL(makeQuery({ skip: 5 }));
      expect(result.limit).toBe('LIMIT -1 OFFSET ?');
      expect(result.limitParams).toEqual([5]);
    });
  });
});

describe('buildQuerySQL', () => {
  it('should build a complete SELECT statement', () => {
    const query = makeQuery({
      selector: { name: 'Alice' } as any,
      sort: [{ name: 'asc' }] as any,
      limit: 10,
      skip: 0,
    });
    const { sql, params } = buildQuerySQL('my_table', query);
    expect(sql).toContain('SELECT data FROM "my_table"');
    expect(sql).toContain('WHERE');
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('LIMIT');
    expect(params).toContain('Alice');
  });
});

describe('buildCountSQL', () => {
  it('should build a COUNT statement without sort/limit/skip', () => {
    const query = makeQuery({
      selector: { age: { $gt: 20 } } as any,
      sort: [{ name: 'asc' }] as any,
      limit: 10,
      skip: 5,
    });
    const { sql, params } = buildCountSQL('my_table', query);
    expect(sql).toContain('SELECT COUNT(*) as count FROM "my_table"');
    expect(sql).toContain('WHERE');
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('LIMIT');
    expect(params).toContain(20);
  });
});
