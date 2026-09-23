import { describe, expect, it } from 'vitest';
import {
  COMMANDS_PATH,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  MAX_COMMANDS_PER_BATCH,
  isCommandBatchResponse,
} from '@tallyui/core';

describe('isCommandBatchResponse', () => {
  it('accepts an empty results array', () => {
    expect(isCommandBatchResponse({ results: [] })).toBe(true);
  });

  it.each(['applied', 'duplicate', 'rejected'])('accepts status %s', (status) => {
    expect(isCommandBatchResponse({ results: [{ id: 'command-1', status }] })).toBe(true);
  });

  it.each([
    null,
    {},
    { results: 'x' },
    { results: [{ status: 'applied' }] },
    { results: [{ id: 'command-1', status: 'ok' }] },
    { results: [null] },
    { results: [{ id: 1, status: 'applied' }] },
  ])('rejects invalid response %j', (value) => {
    expect(isCommandBatchResponse(value)).toBe(false);
  });

  it('does not deep-check optional fields', () => {
    expect(isCommandBatchResponse({
      results: [{ id: 'command-1', status: 'applied', serverRefs: null, warnings: 'x', error: 1 }],
    })).toBe(true);
  });
});

it('exports the protocol constants', () => {
  expect(COMMANDS_PATH).toBe('/tally/v1/commands');
  expect(PROTOCOL_HEADER).toBe('X-Tally-Protocol');
  expect(PROTOCOL_VERSION).toBe(1);
  expect(MAX_COMMANDS_PER_BATCH).toBe(50);
});
