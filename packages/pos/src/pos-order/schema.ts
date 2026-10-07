import { addRxPlugin, type MigrationStrategies, type RxJsonSchema } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { DEFAULT_TAX_ROUNDING } from '../tax/exact';
import { contentVersion } from './command';
import type { PosOrder } from './types';

/**
 * Version 1 adds the optional `sessionId` (ADR-032); nothing else changed from version 0.
 * Version 2 adds three optional fields and changes nothing else: `lateSessionId` (ADR-032, late
 * sale), and ADR-065's `display` and `taxByRate`, declared ahead of the job that writes them so a
 * till migrates once. Create the collection with `posOrderCollection()`, never with this schema
 * alone: RxDB refuses a version above 0 without its migration strategies.
 * Version 3 adds an index on `sessionId` (with its `maxLength`), and the optional `sentVersion` and `downgradedFrom` (the outbox's version fallback), and changes nothing else.
 * Version 4 adds the optional `localWarnings` and `serverFailures` (the outbox's stuck clock start, latest reason and
 * isolation, restored when an outbox starts), and changes nothing else.
 * Version 5 lets `sentVersion` and `downgradedFrom` be 4 (order.create version 4, #286), and changes nothing else. Its
 * migration sets a row's missing `sentVersion` to its content version, the version any earlier attempt went out at.
 * Like version 4 (ADR-069), it is one-way: an older build shows no orders.
 * Version 6 adds `taxRounding`, the strategy the sale's figures were computed with (#287; never sent), and changes
 * nothing else. Its migration sets it on every older row. It is one-way like version 5.
 * Version 7 adds `saleId`, the sale order's id (ADR-072; never sent), and changes nothing else. Its migration is the
 * identity: older orders have no `saleId`. It is one-way like version 6.
 * Version 8 adds fees, shipping, custom lines (ADR-075) and the woocommerce tax rounding (ADR-076), and changes nothing else.
 * It also stores the WooCommerce 6dp net (`netMicros`) under the woocommerce rounding (ADR-076 amendment).
 * Its migration is the identity. It is one-way like version 7.
 * Version 9 adds the order's `coupons` and the receipt's `display.coupons` (ADR-077 d2), and a line's `attributes` (#495)
 * and `regularUnitPriceMinor` (ADR-077 d2), and lets `sentVersion` and `downgradedFrom` be 6 (order.create version 6, ADR-077 d4), and changes nothing else. Nothing writes them yet.
 * Its migration is the identity. It is one-way like version 8.
 */
export const posOrderSchema: RxJsonSchema<PosOrder> = {
  version: 9, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 36 },
    saleId: { type: 'string', maxLength: 36 },
    commandId: { type: 'string', maxLength: 36 },
    createdAt: { type: 'string', maxLength: 40 },
    updatedAt: { type: 'string' },
    currency: { type: 'string' },
    pricesIncludeTax: { type: 'boolean' },
    subtotalMinor: { type: 'integer' }, discountMinor: { type: 'integer' },
    taxMinor: { type: 'integer' }, totalMinor: { type: 'integer' },
    syncStatus: { type: 'string', enum: ['pending', 'applied', 'rejected'], maxLength: 10 },
    note: { type: 'string' }, registerId: { type: 'string' }, sessionId: { type: 'string', maxLength: 36 }, cashierRef: { type: 'string' },
    coupons: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      code: { type: 'string', minLength: 1, maxLength: 255 }, couponId: { type: 'string', minLength: 1, maxLength: 64 },
      discountMinor: { type: 'integer', minimum: 0 }, discountTaxMinor: { type: 'integer', minimum: 0 },
    }, required: ['code', 'couponId', 'discountMinor', 'discountTaxMinor'] } },
    lines: { type: 'array', items: {
      type: 'object', properties: {
        id: { type: 'string', maxLength: 36 }, productId: { type: 'string' }, variantId: { type: 'string' },
        name: { type: 'string' }, sku: { type: 'string' }, quantity: { type: 'integer' },
        taxStatus: { type: 'string', enum: ['taxable', 'none'] },
        custom: { type: 'object', additionalProperties: false, properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 }, sku: { type: 'string', maxLength: 64 },
          taxClass: { type: 'string', maxLength: 64 }, taxStatus: { type: 'string', enum: ['taxable', 'none'] },
        }, required: ['name', 'taxStatus'] },
        unitPriceMinor: { type: 'integer' }, discountMinor: { type: 'integer' }, netMinor: { type: 'integer' },
        attributes: { type: 'object', additionalProperties: { type: 'string' } },
        regularUnitPriceMinor: { type: 'integer' },
        netMicros: { type: 'string', pattern: '^-?[0-9]{1,24}$', maxLength: 25 },
        taxLines: { type: 'array', items: {
          type: 'object', properties: { code: { type: 'string' }, ratePpm: { type: 'integer' }, taxMicros: { type: 'string' } },
          required: ['ratePpm', 'taxMicros'],
        } },
      },
      required: ['id', 'productId', 'name', 'sku', 'quantity', 'unitPriceMinor', 'discountMinor', 'netMinor', 'taxLines'],
    } },
    fees: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string', maxLength: 36 }, name: { type: 'string', minLength: 1, maxLength: 255 },
      amountMinor: { type: 'integer', minimum: 0 }, taxClass: { type: 'string', maxLength: 64 },
      taxStatus: { type: 'string', enum: ['taxable', 'none'] }, netMinor: { type: 'integer' }, taxMicros: { type: 'string' },
      netMicros: { type: 'string', pattern: '^-?[0-9]{1,24}$', maxLength: 25 }, totalMinor: { type: 'integer' },
      taxLines: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        code: { type: 'string', maxLength: 255 }, ratePpm: { type: 'integer' }, taxMicros: { type: 'string' },
        rateId: { type: 'integer' }, compound: { type: 'boolean' },
      }, required: ['ratePpm', 'taxMicros'] } },
    }, required: ['id', 'name', 'amountMinor', 'taxStatus', 'taxLines', 'netMinor', 'taxMicros'] } },
    shipping: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string', maxLength: 36 }, name: { type: 'string', minLength: 1, maxLength: 255 },
      methodId: { type: 'string', maxLength: 64 }, amountMinor: { type: 'integer', minimum: 0 }, taxClass: { type: 'string', maxLength: 64 },
      taxStatus: { type: 'string', enum: ['taxable', 'none'] }, netMinor: { type: 'integer' }, taxMicros: { type: 'string' },
      netMicros: { type: 'string', pattern: '^-?[0-9]{1,24}$', maxLength: 25 }, totalMinor: { type: 'integer' },
      taxLines: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        code: { type: 'string', maxLength: 255 }, ratePpm: { type: 'integer' }, taxMicros: { type: 'string' },
        rateId: { type: 'integer' }, compound: { type: 'boolean' },
      }, required: ['ratePpm', 'taxMicros'] } },
    }, required: ['id', 'name', 'amountMinor', 'taxStatus', 'taxLines', 'netMinor', 'taxMicros'] } },
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
    localWarnings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      code: { type: 'string', maxLength: 64 }, field: { type: 'string', maxLength: 16 }, paymentId: { type: 'string', maxLength: 36 },
    }, required: ['code'] } },
    serverFailures: { type: 'object', additionalProperties: false, properties: {
      since: { type: 'integer', minimum: 0 }, reason: { type: 'string', maxLength: 64 }, isolated: { type: 'boolean' },
    }, required: ['since', 'reason', 'isolated'] },
    lateSessionId: { type: 'string' },
    taxRounding: { type: 'object', additionalProperties: false, properties: {
      granularity: { type: 'string', enum: ['per_order', 'per_line_items', 'per_rate_group_items', 'custom', 'woocommerce'] },
      roundAtSubtotal: { type: 'boolean' },
      mode: { type: 'string', enum: ['half_away_from_zero', 'half_up'] },
    }, required: ['granularity'] },
    sentVersion: { type: 'integer', minimum: 1, maximum: 6 },
    downgradedFrom: { type: 'integer', minimum: 1, maximum: 6 },
    // The nested objects are closed too: loosening a schema later is free, tightening one costs a migration.
    display: { type: 'object', additionalProperties: false, properties: {
      currency: { type: 'string' }, exponent: { type: 'integer' }, taxInclusive: { type: 'boolean' },
      subtotalMinor: { type: 'integer' }, discountMinor: { type: 'integer' }, taxMinor: { type: 'integer' },
      totalMinor: { type: 'integer' }, orderDiscountMinor: { type: 'integer' },
      coupons: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        code: { type: 'string', minLength: 1, maxLength: 255 }, amountMinor: { type: 'integer' },
      }, required: ['code', 'amountMinor'] } },
      fees: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', maxLength: 36 }, name: { type: 'string', minLength: 1, maxLength: 255 }, amountMinor: { type: 'integer' },
      }, required: ['id', 'name', 'amountMinor'] } },
      shipping: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', maxLength: 36 }, name: { type: 'string', minLength: 1, maxLength: 255 }, amountMinor: { type: 'integer' },
      }, required: ['id', 'name', 'amountMinor'] } },
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
    'totalMinor', 'payments', 'customer', 'syncStatus', 'commandId', 'updatedAt', 'taxRounding'],
  indexes: ['createdAt', 'syncStatus', ['syncStatus', 'createdAt'], 'sessionId'],
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
  // Every row before version 5 was built without version 4, so its content version is what any earlier attempt
  // went out at (a downgraded row has its sentVersion already): each retry then resends those bytes (#286).
  const recordSent = (doc: PosOrder) => { doc.sentVersion ??= contentVersion(doc); return doc; };
  // Every row before version 6 was computed per_order + half_away_from_zero: no released build or app set another
  // strategy (#309's `rounding` reaches a sale only through TaxProvider's props, which no app passes yet). Recording
  // it means no older sale is ever re-rounded (#287).
  const recordRounding = (doc: PosOrder) => { doc.taxRounding ??= { ...DEFAULT_TAX_ROUNDING }; return doc; };
  return { schema: posOrderSchema,
    migrationStrategies: { 1: identity, 2: identity, 3: identity, 4: identity, 5: recordSent, 6: recordRounding, 7: identity, 8: identity, 9: identity } };
}
