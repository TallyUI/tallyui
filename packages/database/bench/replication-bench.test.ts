// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RxJsonSchema } from 'rxdb';
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

import { runReplicationBench } from './replication-bench';

type Document = { id: string; name: string };
type Checkpoint = { offset: number };

const schema: RxJsonSchema<Document> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
  },
  required: ['id', 'name'],
};

const context: SyncContext = {
  connectorId: 'test',
  baseUrl: 'http://localhost',
  headers: {},
};

const documents = Array.from({ length: 2500 }, (_, i) => ({
  id: `p${String(i).padStart(4, '0')}`,
  name: `Product ${i}`,
  _deleted: false,
}));

const adapter: ReplicationAdapter<Document, Checkpoint> = {
  pull: {
    async handler(checkpoint, batchSize) {
      const offset = checkpoint?.offset ?? 0;
      const page = documents.slice(offset, offset + batchSize);
      return { documents: page, checkpoint: { offset: offset + page.length } };
    },
  },
};

describe('runReplicationBench', () => {
  it('pulls every document once and counts requests', async () => {
    const result = await runReplicationBench({ adapter, schema, context, batchSize: 100 });

    expect(result.documents).toBe(2500);
    expect(result.requests).toBeGreaterThanOrEqual(26);
  });

  it('reports positive timing and heap figures', async () => {
    const result = await runReplicationBench({ adapter, schema, context });

    expect(result.totalMs).toBeGreaterThan(0);
    expect(result.docsPerSecond).toBeGreaterThan(0);
    expect(result.peakHeapMB).toBeGreaterThan(0);
    expect(result.batchSize).toBe(100);
  });

  it('rejects promptly when the pull fails', async () => {
    const failingAdapter: ReplicationAdapter<Document, Checkpoint> = {
      pull: {
        async handler() {
          throw new Error('boom');
        },
      },
    };
    const startedAt = performance.now();

    await expect(runReplicationBench({ adapter: failingAdapter, schema, context }))
      .rejects.toMatchObject({
        code: 'RC_PULL',
        parameters: { errors: [expect.objectContaining({ message: 'boom' })] },
      });
    expect(performance.now() - startedAt).toBeLessThan(5000);
  }, 5000);
});
