import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { FakePairingSignalling, pendingClaim } from './fake-signalling.test-helper';
import { PENDING_POLL_MS, createTillPairing, type PairingPhase, type TillPairing } from './till-pairing';

const ctx: SyncContext = { connectorId: 'woo', baseUrl: 'https://shop.test', headers: {} };
const NOW = '2026-11-11T10:00:00.000Z';
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

let pairings: TillPairing[] = [];
function setup(context: SyncContext | null = ctx) {
  const signalling = new FakePairingSignalling();
  const service = { refresh: vi.fn(async () => {}) };
  const errors: unknown[] = [];
  const pairing = createTillPairing({ signalling, context: () => context, deviceId: 'till-1', service, onError: (error) => errors.push(error) });
  pairings.push(pairing);
  return { signalling, service, errors, pairing };
}
/** Starts, then lists the given claims at the first poll. */
async function withClaims(...claims: ReturnType<typeof pendingClaim>[]) {
  const s = setup();
  s.signalling.claims = claims;
  await s.pairing.start();
  await wait(PENDING_POLL_MS);
  return s;
}
const claimsOf = (phase: PairingPhase) => (phase.phase === 'code' ? phase.claims.map((claim) => [claim.claimId, claim.checkCode]) : null);

describe('createTillPairing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    pairings = [];
  });
  afterEach(() => {
    pairings.forEach((pairing) => pairing.close());
    vi.useRealTimers();
  });

  it('1: start shows the code and its expiry, and the pending poll fills the claims with their check codes', async () => {
    const s = setup();
    const start = s.pairing.start();
    expect(s.pairing.phase).toEqual({ phase: 'minting' });
    await start;
    expect(s.pairing.phase).toEqual({ phase: 'code', code: '100001', expiresAt: '2026-11-11T10:10:00.000Z', claims: [] });
    s.signalling.claims = [pendingClaim('k1', '4821'), pendingClaim('k2', '0937')];
    await wait(PENDING_POLL_MS);
    expect(claimsOf(s.pairing.phase)).toEqual([['k1', '4821'], ['k2', '0937']]);
    expect(s.signalling.called('pending')).toHaveLength(1);
    await s.pairing.start();
    expect(s.pairing.phase).toMatchObject({ phase: 'code', code: '100002', claims: [] });
  });

  it('1b: a network poll failure keeps the code, reports it, and polls again', async () => {
    const s = setup();
    await s.pairing.start();
    s.signalling.fail('pending', 'network');
    await wait(PENDING_POLL_MS);
    expect(s.pairing.phase.phase).toBe('code');
    expect(s.errors).toHaveLength(1);
    s.signalling.heal('pending');
    s.signalling.claims = [pendingClaim('k1', '4821')];
    await wait(PENDING_POLL_MS);
    expect(claimsOf(s.pairing.phase)).toEqual([['k1', '4821']]);
    s.signalling.fail('pending', 'forbidden');
    await wait(PENDING_POLL_MS);
    expect(s.pairing.phase).toEqual({ phase: 'idle', error: 'forbidden' });
  });

  it('2: the code expires at expiresAt: idle with expired, and no poll after', async () => {
    const s = setup();
    await s.pairing.start();
    await wait(10 * 60_000 - 1);
    expect(s.pairing.phase.phase).toBe('code');
    await wait(1);
    expect(s.pairing.phase).toEqual({ phase: 'idle', error: 'expired' });
    const polls = s.signalling.called('pending').length;
    await wait(PENDING_POLL_MS * 5);
    expect(s.signalling.called('pending')).toHaveLength(polls);
  });

  it.each(['forbidden', 'limit', 'network'] as const)('3: a mint refused with %s gives idle with that error', async (code) => {
    const s = setup();
    s.signalling.fail('mint', code);
    await s.pairing.start();
    expect(s.pairing.phase).toEqual({ phase: 'idle', error: code });
    expect(s.errors).toHaveLength(1);
    await wait(PENDING_POLL_MS * 2);
    expect(s.signalling.called('pending')).toHaveLength(0);
  });

  it('3b: a thrown non-signalling error is server', async () => {
    const s = setup();
    s.signalling.mint = () => Promise.reject(new TypeError('boom'));
    await s.pairing.start();
    expect(s.pairing.phase).toEqual({ phase: 'idle', error: 'server' });
  });

  it('4: confirm refreshes the service once, then idle; a not_found confirm gives that error and no refresh', async () => {
    const s = await withClaims(pendingClaim('k1', '4821'));
    const done = s.pairing.confirm('k1');
    expect(s.pairing.phase).toEqual({ phase: 'confirming', claimId: 'k1' });
    await done;
    expect(s.signalling.called('confirm')).toEqual([{ method: 'confirm', id: 'k1' }]);
    expect(s.service.refresh).toHaveBeenCalledTimes(1);
    expect(s.pairing.phase).toEqual({ phase: 'idle' });

    const t = await withClaims(pendingClaim('k2', '0937'));
    t.signalling.fail('confirm', 'not_found');
    await t.pairing.confirm('k2');
    expect(t.pairing.phase).toEqual({ phase: 'idle', error: 'not_found' });
    expect(t.service.refresh).not.toHaveBeenCalled();
    expect(t.errors).toHaveLength(1);
  });

  it('5: decline removes the claim and stays in code; a refused decline reports and keeps it', async () => {
    const s = await withClaims(pendingClaim('k1', '4821'), pendingClaim('k2', '0937'));
    await s.pairing.decline('k1');
    expect(s.pairing.phase.phase).toBe('code');
    expect(claimsOf(s.pairing.phase)).toEqual([['k2', '0937']]);
    s.signalling.fail('decline', 'network');
    await s.pairing.decline('k2');
    expect(claimsOf(s.pairing.phase)).toEqual([['k2', '0937']]);
    expect(s.errors).toHaveLength(1);
  });

  it('6: forget refreshes the service; a refused forget sets forgetError, and the next success clears it', async () => {
    const s = setup();
    await s.pairing.forget('d1');
    expect(s.signalling.called('forget')).toEqual([{ method: 'forget', id: 'd1' }]);
    expect(s.service.refresh).toHaveBeenCalledTimes(1);
    expect(s.pairing.forgetError).toBeNull();
    s.signalling.fail('forget', 'not_found');
    await s.pairing.forget('d2');
    expect(s.pairing.forgetError).toBe('not_found');
    expect(s.pairing.phase).toEqual({ phase: 'idle' });
    expect(s.service.refresh).toHaveBeenCalledTimes(1);
    s.signalling.heal('forget');
    await s.pairing.forget('d2');
    expect(s.pairing.forgetError).toBeNull();
    expect(s.service.refresh).toHaveBeenCalledTimes(2);
  });

  it('7: with no cashier session, start gives forbidden and makes no call', async () => {
    const s = setup(null);
    await s.pairing.start();
    expect(s.pairing.phase).toEqual({ phase: 'idle', error: 'forbidden' });
    await s.pairing.forget('d1');
    expect(s.pairing.forgetError).toBe('forbidden');
    expect(s.signalling.calls).toEqual([]);
  });

  it('8: after close nothing is called and nothing changes', async () => {
    const s = setup();
    await s.pairing.start();
    const listener = vi.fn();
    s.pairing.onChange(listener);
    s.pairing.close();
    const calls = s.signalling.calls.length;
    await s.pairing.start();
    await s.pairing.confirm('k1');
    await s.pairing.decline('k1');
    await s.pairing.forget('d1');
    s.pairing.cancel();
    await wait(10 * 60_000);
    expect(s.signalling.calls).toHaveLength(calls);
    expect(s.service.refresh).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('cancel goes back to idle and stops polling', async () => {
    const s = setup();
    await s.pairing.start();
    s.pairing.cancel();
    expect(s.pairing.phase).toEqual({ phase: 'idle' });
    await wait(PENDING_POLL_MS * 3);
    expect(s.signalling.called('pending')).toHaveLength(0);
  });
});
