import { addRxPlugin, type MigrationStrategies, type RxJsonSchema } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import type { PosOrder } from './types';

/**
 * Version 1 adds the optional `sessionId` (ADR-032); nothing else changed from version 0.
 * Version 2 adds three optional fields and changes nothing else: `lateSessionId` (ADR-032, late
 * sale), and ADR-065's `display` and `taxByRate`, declared ahead of the job that writes them so a
 * till migrates once. Create the collection with `posOrderCollection()`, never with this schema
 * alone: RxDB refuses a version above 0 without its migration strategies.
 */
export const posOrderSchema: RxJsonSchema<PosOrder> = {
  version: 2, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 36 },
    commandId: { type: 'string', maxLength: 36 },
    createdAt: { type: 'string', maxLength: 40 },
    updatedAt: { type: 'string' },
    currency: { type: 'string' },
    pricesIncludeTax: { type: 'boolean' },
    subtotalMinor: { type: 'integer' }, discountMinor: { type: 'integer' },
    taxMinor: { type: 'integer' }, totalMinor: { type: 'integer' },
    syncStatus: { type: 'string', enum: ['pending', 'applied', 'rejected'], maxLength: 10 },
    note: { type: 'string' }, registerId: { type: 'string' }, sessionId: { type: 'string' }, cashierRef: { type: 'string' },
    lines: { type: 'array', items: {
      type: 'object', properties: {
        id: { type: 'string', maxLength: 36 }, productId: { type: 'string' }, variantId: { type: 'string' },
        name: { type: 'string' }, sku: { type: 'string' }, quantity: { type: 'integer' },
        unitPriceMinor: { type: 'integer' }, discountMinor: { type: 'integer' }, netMinor: { type: 'integer' },
        taxLines: { type: 'array', items: {
          type: 'object', properties: { code: { type: 'string' }, ratePpm: { type: 'integer' }, taxMicros: { type: 'string' } },
          required: ['ratePpm', 'taxMicros'],
        } },
      },
      required: ['id', 'productId', 'name', 'sku', 'quantity', 'unitPriceMinor', 'discountMinor', 'netMinor', 'taxLines'],
    } },
    payments: { type: 'array', items: {
      type: 'object', properties: {
        id: { type: 'string', maxLength: 36 }, method: { type: 'string', enum: ['cash', 'external'] },
        amountMinor: { type: 'integer' }, tenderedMinor: { type: 'integer' }, changeMinor: { type: 'integer' }, reference: { type: 'string' },
      }, required: ['id', 'method', 'amountMinor'],
    } },
    customer: { type: ['object', 'null'], properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } } },
    serverRefs: { type: 'object', properties: {
      orderId: { type: 'string' }, displayId: { type: 'string' }, totalMinor: { type: 'integer' },
    }, required: ['orderId', 'totalMinor'] },
    warnings: { type: 'array', items: {
      type: 'object', properties: { code: { type: 'string', maxLength: 64 } },
      required: ['code'], additionalProperties: true,
    } },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] },
    lateSessionId: { type: 'string' },
    // The nested objects are closed too: loosening a schema later is free, tightening one costs a migration.
    display: { type: 'object', additionalProperties: false, properties: {
      currency: { type: 'string' }, exponent: { type: 'integer' }, taxInclusive: { type: 'boolean' },
      subtotalMinor: { type: 'integer' }, discountMinor: { type: 'integer' }, taxMinor: { type: 'integer' },
      totalMinor: { type: 'integer' }, orderDiscountMinor: { type: 'integer' },
      lines: { type: 'array', items: {
        type: 'object', additionalProperties: false, properties: {
          lineId: { type: 'string' }, amountMinor: { type: 'integer' },
          discounts: { type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: { discountId: { type: 'string' }, label: { type: 'string' }, amountMinor: { type: 'integer' } },
            required: ['discountId', 'amountMinor'],
          } },
        }, required: ['lineId', 'amountMinor', 'discounts'],
      } },
    }, required: ['currency', 'exponent', 'taxInclusive', 'subtotalMinor', 'discountMinor', 'taxMinor', 'totalMinor', 'orderDiscountMinor', 'lines'] },
    taxByRate: { type: 'array', items: {
      type: 'object', additionalProperties: false, properties: {
        ratePpm: { type: 'integer' }, code: { type: 'string' }, label: { type: 'string' }, netMinor: { type: 'integer' },
        amountMinor: { type: 'integer' }, grossMinor: { type: 'integer' },
      }, required: ['ratePpm', 'netMinor', 'amountMinor', 'grossMinor'],
    } },
  },
  required: ['id', 'createdAt', 'currency', 'pricesIncludeTax', 'lines', 'subtotalMinor', 'discountMinor', 'taxMinor',
    'totalMinor', 'payments', 'customer', 'syncStatus', 'commandId', 'updatedAt'],
  indexes: ['createdAt', 'syncStatus', ['syncStatus', 'createdAt']],
};

/**
 * The `pos_orders` collection config, with its migration strategies. Open the collection with
 * `addPosOrderCollection(db)`, which uses this and settles the migration safely; adding this config
 * directly leaves RxDB's own open path. `pos_orders` holds sales not yet sent, so no step may drop a
 * document: versions 1 and 2 only add optional fields, so every order from version 0 or 1 passes
 * unchanged.
 *
 * Within one run, RxDB 16.21 keeps an order that fails the new schema's validation: with a
 * validating storage the migration stops with DM4 and the order stays in the older version's
 * storage; without one it is copied as is. **Across runs, RxDB's own open path can lose it**: a
 * failed run can leave its checkpoint past that order, and the next run then removes the older
 * version's storage without copying it. `addPosOrderCollection` resets that checkpoint, so use it
 * (`migration.test.ts`).
 */
export function posOrderCollection(): { schema: RxJsonSchema<PosOrder>; migrationStrategies: MigrationStrategies } {
  // addRxPlugin ignores a plugin it already has.
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const identity = (doc: PosOrder) => doc;
  return { schema: posOrderSchema, migrationStrategies: { 1: identity, 2: identity } };
}
