// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { probeCases, probeEnvelope } from './tax-exempt-probe-envelopes';
import { createWooCommandTransport } from './transport';

describe.skipIf(!process.env.WOO_EXEMPT_BASE_URL || !process.env.WOO_EXEMPT_TOKEN_FILE || !process.env.WOO_EXEMPT_PRODUCT_ID)('live Woo tax exemption', () => {
  it('pushes E1–E3 without tax and C1 with tax', async () => {
    const token = (await readFile(process.env.WOO_EXEMPT_TOKEN_FILE!, 'utf8')).trim();
    const pushes: Response[] = [];
    const transport = createWooCommandTransport({ baseUrl: process.env.WOO_EXEMPT_BASE_URL!, acceptsTaxExempt: true,
      getHeaders: () => ({ Authorization: `Bearer ${token}`, 'X-WCPOS': '1' }),
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (String(input).endsWith('/push/orders')) pushes.push(response.clone());
        return response;
      } });
    const uuid = () => {
      const id = randomUUID();
      return `${id.slice(0, 14)}7${id.slice(15)}`;
    };
    for (const [index, name] of probeCases.entries()) {
      const envelope = probeEnvelope(name, { mutationId: uuid(), recordId: uuid() }, uuid(), process.env.WOO_EXEMPT_PRODUCT_ID!);
      const result = await transport.send([envelope]);
      expect(result).toMatchObject({ kind: 'results', results: [{ status: 'applied', serverRefs: { totalMinor: envelope.payload.totalMinor } }] });
      if (result.kind === 'results') expect(result.results[0]).not.toHaveProperty('warnings');
      expect(pushes).toHaveLength(index + 1);
      expect(parseFloat((await pushes[index].json()).document.total_tax)).toBe(name === 'C1' ? 1.90 : 0);
    }
  }, 120000);
});
