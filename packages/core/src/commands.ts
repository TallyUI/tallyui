import type { CommandBatchResponse } from './types/commands';

/** Path of the command endpoint, relative to the backend's base URL. */
export const COMMANDS_PATH = '/tally/v1/commands';
/** Header carrying the protocol version. */
export const PROTOCOL_HEADER = 'X-Tally-Protocol';
/** Current protocol version. */
export const PROTOCOL_VERSION = 1;
/** The ADR-038 batch limit; a server answers more with 413 and a BatchTooLargeBody. */
export const MAX_COMMANDS_PER_BATCH = 50;
/** The longest order.create `note` (version 7, ADR-083), in UTF-16 code units. WCPOS v2's order note has no cap; this bounds the wire. */
export const ORDER_NOTE_MAX = 1000;
/** The most tax ids order.create 12 carries in `customer.taxIds` (ADR-092). */
export const ORDER_TAX_IDS_MAX = 10;
/** The longest order.create 12 tax id `type` (the connector's scheme id), in UTF-16 code units (ADR-092). */
export const ORDER_TAX_ID_TYPE_MAX = 32;
/** The longest order.create 12 tax id `value`, in UTF-16 code units (ADR-092). */
export const ORDER_TAX_ID_VALUE_MAX = 64;
/** The most entries order.create 12 carries in `meta`; a meta value's bound is ORDER_NOTE_MAX (ADR-092). */
export const ORDER_META_MAX = 50;
/** The longest order.create 12 meta `key`, in UTF-16 code units (ADR-092). */
export const ORDER_META_KEY_MAX = 255;
/** The longest order.create 12 catalogue line `sku`, in UTF-16 code units; WooCommerce's product lookup table holds 100 (ADR-092). */
export const ORDER_LINE_SKU_MAX = 100;

/**
 * True if `value` has the shape of a CommandBatchResponse: an object with a
 * `results` array whose every entry has a string `id` and a `status` of
 * 'applied' | 'duplicate' | 'rejected'. Optional fields are not deep-checked.
 */
export function isCommandBatchResponse(value: unknown): value is CommandBatchResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'results' in value &&
    Array.isArray(value.results) &&
    value.results.every((result: unknown) =>
      typeof result === 'object' &&
      result !== null &&
      'id' in result &&
      typeof result.id === 'string' &&
      'status' in result &&
      (result.status === 'applied' || result.status === 'duplicate' || result.status === 'rejected'),
    )
  );
}
