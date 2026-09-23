import type { RxJsonSchema } from 'rxdb';
import type { PosOrder } from './types';

export const posOrderSchema: RxJsonSchema<PosOrder> = {
  version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
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
    note: { type: 'string' }, registerId: { type: 'string' }, cashierRef: { type: 'string' },
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
    warnings: { type: 'array', items: { oneOf: [
      { type: 'object', properties: {
        code: { type: 'string', enum: ['total_mismatch'] }, expectedMinor: { type: 'integer' }, serverMinor: { type: 'integer' },
      }, required: ['code', 'expectedMinor', 'serverMinor'] },
      { type: 'object', properties: {
        code: { type: 'string', enum: ['insufficient_stock'] }, variantId: { type: 'string' }, quantity: { type: 'integer' },
      }, required: ['code', 'variantId', 'quantity'] },
    ] } },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] },
  },
  required: ['id', 'createdAt', 'currency', 'pricesIncludeTax', 'lines', 'subtotalMinor', 'discountMinor', 'taxMinor',
    'totalMinor', 'payments', 'customer', 'syncStatus', 'commandId', 'updatedAt'],
  indexes: ['createdAt', 'syncStatus', ['syncStatus', 'createdAt']],
};
