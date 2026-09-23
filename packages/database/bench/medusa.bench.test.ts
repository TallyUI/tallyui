// @vitest-environment node
/*
TALLY_BENCH_MEDUSA_URL=http://127.0.0.1:9000 TALLY_BENCH_MEDUSA_KEY=sk_... \
  ./node_modules/.bin/vitest run packages/database/bench/medusa.bench.test.ts --maxWorkers=1
*/
import { describe, expect, it } from 'vitest';
import { medusaConnector } from '@tallyui/connector-medusa';

import { runReplicationBench } from './replication-bench';

describe.skipIf(!process.env.TALLY_BENCH_MEDUSA_URL)('medusa replication bench', () => {
  it('pulls all products and prints benchmark results', async () => {
    const baseUrl = process.env.TALLY_BENCH_MEDUSA_URL!;
    const key = process.env.TALLY_BENCH_MEDUSA_KEY!;
    const batchSize = Number(process.env.TALLY_BENCH_BATCH ?? 100);
    const result = await runReplicationBench({
      adapter: medusaConnector.replication!.products!,
      schema: medusaConnector.schemas.products,
      context: {
        connectorId: 'medusa',
        baseUrl,
        headers: medusaConnector.auth.getHeaders({ api_token: key }),
      },
      batchSize,
    });

    console.log('BENCH ' + JSON.stringify({ target: 'medusa', ...result }));
    expect(result.documents).toBeGreaterThan(0);
  }, 600000);
});
