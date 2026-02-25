/**
 * Translates RxDB Mango-style queries into SQL WHERE clauses
 * that use SQLite's json_extract() to access document fields.
 *
 * Supported operators:
 *   Comparison: $eq (default), $gt, $gte, $lt, $lte, $ne
 *   Array:      $in, $nin
 *   String:     $regex
 *   Logical:    $and, $or
 *
 * Plus: sort, limit, skip
 */

import type { FilledMangoQuery, MangoQuerySelector } from 'rxdb';

export interface MangoSqlResult {
  where: string;
  params: any[];
  orderBy: string;
  limit: string;
  limitParams: any[];
}

/**
 * Convert a Mango selector + sort/skip/limit into SQL fragments.
 * The returned `where` always starts with `WHERE ...` (including the
 * mandatory `_deleted = 0` filter for non-deleted documents).
 *
 * All document field access goes through `json_extract(data, '$.fieldName')`.
 */
export function mangoQueryToSQL<RxDocType>(
  query: FilledMangoQuery<RxDocType>,
): MangoSqlResult {
  const params: any[] = [];
  const conditions: string[] = [];

  // Always filter out deleted docs -- RxDB's query() contract.
  conditions.push(`json_extract(data, '$._deleted') = 0`);

  // Process the selector
  if (query.selector && Object.keys(query.selector).length > 0) {
    const selectorSql = selectorToSQL(query.selector as Record<string, any>, params);
    if (selectorSql) {
      conditions.push(selectorSql);
    }
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // ORDER BY
  let orderBy = '';
  if (query.sort && query.sort.length > 0) {
    const orderParts = query.sort.map((sortPart) => {
      const entries = Object.entries(sortPart);
      if (entries.length === 0) return '';
      const [field, direction] = entries[0];
      const jsonPath = fieldToJsonExtract(field);
      return `${jsonPath} ${direction === 'desc' ? 'DESC' : 'ASC'}`;
    }).filter(Boolean);
    if (orderParts.length > 0) {
      orderBy = `ORDER BY ${orderParts.join(', ')}`;
    }
  }

  // LIMIT / OFFSET
  const limitParams: any[] = [];
  let limit = '';
  if (query.limit !== undefined && query.limit !== null) {
    limit = 'LIMIT ?';
    limitParams.push(query.limit);
  }
  if (query.skip && query.skip > 0) {
    if (!limit) {
      // SQLite requires LIMIT before OFFSET
      limit = 'LIMIT -1';
    }
    limit += ' OFFSET ?';
    limitParams.push(query.skip);
  }

  return { where, params, orderBy, limit, limitParams };
}

/**
 * Build the full SQL SELECT query from mango query result.
 */
export function buildQuerySQL<RxDocType>(
  tableName: string,
  query: FilledMangoQuery<RxDocType>,
): { sql: string; params: any[] } {
  const result = mangoQueryToSQL(query);
  const allParams = [...result.params, ...result.limitParams];
  const parts = [
    `SELECT data FROM "${tableName}"`,
    result.where,
    result.orderBy,
    result.limit,
  ].filter(Boolean);
  return { sql: parts.join(' '), params: allParams };
}

/**
 * Build a COUNT SQL query from mango query result.
 * Ignores sort, skip, and limit per RxDB's count() contract.
 */
export function buildCountSQL<RxDocType>(
  tableName: string,
  query: FilledMangoQuery<RxDocType>,
): { sql: string; params: any[] } {
  const result = mangoQueryToSQL(query);
  const parts = [
    `SELECT COUNT(*) as count FROM "${tableName}"`,
    result.where,
  ].filter(Boolean);
  return { sql: parts.join(' '), params: result.params };
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

function fieldToJsonExtract(field: string): string {
  return `json_extract(data, '$.${field}')`;
}

function selectorToSQL(
  selector: Record<string, any>,
  params: any[],
): string {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(selector)) {
    if (key === '$and') {
      const andConditions = (value as Record<string, any>[]).map(
        (sub) => selectorToSQL(sub, params),
      ).filter(Boolean);
      if (andConditions.length > 0) {
        conditions.push(`(${andConditions.join(' AND ')})`);
      }
    } else if (key === '$or') {
      const orConditions = (value as Record<string, any>[]).map(
        (sub) => selectorToSQL(sub, params),
      ).filter(Boolean);
      if (orConditions.length > 0) {
        conditions.push(`(${orConditions.join(' OR ')})`);
      }
    } else {
      // It's a field name with either a value or an operator object
      const fieldSql = fieldConditionToSQL(key, value, params);
      if (fieldSql) {
        conditions.push(fieldSql);
      }
    }
  }

  return conditions.join(' AND ');
}

function fieldConditionToSQL(
  field: string,
  value: any,
  params: any[],
): string {
  const jsonPath = fieldToJsonExtract(field);

  // Plain value means $eq
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    params.push(value);
    return `${jsonPath} = ?`;
  }

  // Object with operators
  const conditions: string[] = [];
  for (const [op, opValue] of Object.entries(value)) {
    switch (op) {
      case '$eq':
        params.push(opValue);
        conditions.push(`${jsonPath} = ?`);
        break;
      case '$ne':
        params.push(opValue);
        conditions.push(`${jsonPath} != ?`);
        break;
      case '$gt':
        params.push(opValue);
        conditions.push(`${jsonPath} > ?`);
        break;
      case '$gte':
        params.push(opValue);
        conditions.push(`${jsonPath} >= ?`);
        break;
      case '$lt':
        params.push(opValue);
        conditions.push(`${jsonPath} < ?`);
        break;
      case '$lte':
        params.push(opValue);
        conditions.push(`${jsonPath} <= ?`);
        break;
      case '$in': {
        const arr = opValue as any[];
        if (arr.length === 0) {
          conditions.push('0'); // always false
        } else {
          const placeholders = arr.map(() => '?').join(', ');
          params.push(...arr);
          conditions.push(`${jsonPath} IN (${placeholders})`);
        }
        break;
      }
      case '$nin': {
        const arr = opValue as any[];
        if (arr.length === 0) {
          // No exclusions, always true -- skip
        } else {
          const placeholders = arr.map(() => '?').join(', ');
          params.push(...arr);
          conditions.push(`${jsonPath} NOT IN (${placeholders})`);
        }
        break;
      }
      case '$regex': {
        // SQLite does not natively support regex, but we can use LIKE for simple patterns
        // or GLOB. For a more complete solution we'd need a regex extension.
        // Here we convert simple regex patterns to LIKE patterns.
        const regexStr = typeof opValue === 'string' ? opValue : (opValue as RegExp).source;
        const likePattern = regexToLike(regexStr);
        params.push(likePattern);
        conditions.push(`${jsonPath} LIKE ?`);
        break;
      }
      default:
        // Unknown operator -- skip (RxDB might send $options etc.)
        break;
    }
  }

  return conditions.join(' AND ');
}

/**
 * Convert a simple regex pattern to a SQLite LIKE pattern.
 * Only handles basic patterns:
 *   ^foo  -> foo%
 *   foo$  -> %foo
 *   ^foo$ -> foo
 *   foo   -> %foo%
 *   .*    -> %
 */
function regexToLike(regex: string): string {
  let pattern = regex;
  let prefix = '%';
  let suffix = '%';

  if (pattern.startsWith('^')) {
    prefix = '';
    pattern = pattern.slice(1);
  }
  if (pattern.endsWith('$')) {
    suffix = '';
    pattern = pattern.slice(0, -1);
  }

  // Replace .* with %
  pattern = pattern.replace(/\.\*/g, '%');
  // Replace . with _
  pattern = pattern.replace(/\./g, '_');
  // Escape existing % and _ that aren't our wildcards
  // (This is approximate -- a real implementation would need more care)

  return `${prefix}${pattern}${suffix}`;
}
