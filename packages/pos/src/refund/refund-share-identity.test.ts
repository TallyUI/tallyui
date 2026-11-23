// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as core from '@tallyui/core';
import * as server from '@tallyui/core/server';
import { refundableLines, priceRefund } from '../index';
import { roundRatio } from '../tax/exact';

describe('refund share', () => {
  it("pos re-exports core's refund share and roundRatio unchanged", () => {
    expect(refundableLines).toBe(core.refundableLines);
    expect(priceRefund).toBe(core.priceRefund);
    expect(roundRatio).toBe(core.roundRatio);
    expect(core.refundableLines).toBe(server.refundableLines);
    expect(core.priceRefund).toBe(server.priceRefund);
    expect(core.roundRatio).toBe(server.roundRatio);
  });
});
