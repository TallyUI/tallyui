import type { CommandBatchResponse } from './types/commands';

/** Path of the command endpoint, relative to the backend's base URL. */
export const COMMANDS_PATH = '/tally/v1/commands';
/** Header carrying the protocol version. */
export const PROTOCOL_HEADER = 'X-Tally-Protocol';
/** Current protocol version. */
export const PROTOCOL_VERSION = 1;
/** The ADR-038 batch limit; a server answers more with 413 and a BatchTooLargeBody. */
export const MAX_COMMANDS_PER_BATCH = 50;

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
