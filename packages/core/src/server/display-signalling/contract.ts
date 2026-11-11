import type { SyncContext } from '../../types/connector';
import type { DisplaySignalling, DisplaySignallingContext, DisplaySignallingErrorCode } from '../../types/display-signalling';
import { sha256Hex, type DisplaySignallingHarness } from './memory-server';

const MINUTE = 60_000, DAY = 24 * 60 * MINUTE;
/** The two till devices. */
const A = 'till-a', B = 'till-b';
const SECRET = /^[A-Za-z0-9_-]{22,}$/;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`display signalling contract: ${message}`);
}

/** Resolves to the refusal when `promise` rejects with `code`; throws otherwise. */
async function expectRefusal(promise: Promise<unknown>, code: DisplaySignallingErrorCode, what: string): Promise<Error> {
  let result: unknown;
  try {
    result = await promise;
  } catch (error) {
    const got = (error as { code?: unknown } | null)?.code;
    check(got === code, `${what}: expected ${code}, got ${String(got ?? error)}`);
    return error as Error;
  }
  throw new Error(`display signalling contract: ${what}: expected ${code}, but it resolved ${JSON.stringify(result)}`);
}

const sameRefusal = (x: Error, y: Error, what: string): void =>
  check(x.message === y.message && (x as { code?: unknown }).code === (y as { code?: unknown }).code, `${what}: the refusals differ`);

/** A code of the same length that is not one of `used`. */
function unusedCode(...used: string[]): string {
  for (let n = 0; ; n += 1) {
    const code = String(n).padStart(used[0]?.length ?? 6, '0');
    if (!used.includes(code)) return code;
  }
}

interface World { h: DisplaySignallingHarness; s: DisplaySignalling; a: SyncContext; b: SyncContext; viewer: SyncContext }

async function world(make: () => Promise<DisplaySignallingHarness>): Promise<World> {
  const h = await make();
  const till = (cashierId: string, canPair = true) => h.till({ cashierId, canPair });
  return { h, s: h.signalling, a: await till('cashier-a'), b: await till('cashier-b'), viewer: await till('cashier-viewer', false) };
}

/** Claims a fresh code from `deviceId`, giving the claim and its pending pairing's id. */
async function claimed(w: World, ctx: SyncContext, deviceId: string, d: DisplaySignallingContext, name: string, token?: string) {
  const { code } = await w.s.mint(ctx, deviceId);
  const claim = await w.s.claim(d, { code, displayName: name, ...(token ? { token } : {}) });
  const entry = (await w.s.pending(ctx, deviceId)).find((p) => p.checkCode === claim.checkCode);
  check(entry && entry.displayName === name, `the pending listing lacks the claim by ${name}`);
  return { code, claim, claimId: entry.claimId };
}

/** Pairs a display with `deviceId` end to end: mint, claim, confirm, collect. */
async function paired(w: World, ctx: SyncContext, deviceId: string, source: string, name: string, token?: string) {
  const d = w.h.display(source);
  const { claim, claimId } = await claimed(w, ctx, deviceId, d, name, token);
  await w.s.confirm(ctx, deviceId, claimId);
  const result = await w.s.collect(d, claim.claimSecret);
  check(result.status === 'paired', `collect after the confirm gave ${result.status}`);
  return { d, claim, displayId: result.displayId, token: result.token };
}

/**
 * The security floor of ADR-085 d4–d6 and d8, and #705, as runner-agnostic cases: each builds a fresh harness and
 * throws on failure. Each plugin's connector runs it against its own routes:
 * `for (const c of displaySignallingContract(make)) it(c.name, c.run);`
 */
export function displaySignallingContract(makeHarness: () => Promise<DisplaySignallingHarness>): Array<{ name: string; run: () => Promise<void> }> {
  const cases: Record<string, (w: World) => Promise<void>> = {
    'mint without the capability is forbidden and makes no code': async ({ h, s, viewer }) => {
      await expectRefusal(s.mint(viewer, A), 'forbidden', 'mint without the capability');
      check((await h.storedCounts()).codes === 0, 'a refused mint stored a code');
    },
    'a minted code is at least 6 digits and expires within 10 minutes': async ({ h, s, a }) => {
      const { code, expiresAt } = await s.mint(a, A);
      check(/^\d{6,}$/.test(code), `code ${code} is not 6 or more digits`);
      check(!Number.isNaN(Date.parse(expiresAt)), `expiresAt ${expiresAt} is not a date`);
      await h.advance(10 * MINUTE);
      await expectRefusal(s.claim(h.display('192.0.2.1'), { code, displayName: 'Late' }), 'claim_refused', 'a claim 10 minutes after the mint');
    },
    'a device holds at most 5 unspent codes, and expired codes stop counting': async ({ h, s, a }) => {
      for (let i = 0; i < 5; i += 1) await s.mint(a, A);
      await expectRefusal(s.mint(a, A), 'limit', 'the 6th unspent code');
      await h.advance(10 * MINUTE);
      await s.mint(a, A);
    },
    'spent, expired and unknown codes get the same claim refusal': async ({ h, s, a }) => {
      const spent = (await s.mint(a, A)).code;
      await s.claim(h.display('192.0.2.1'), { code: spent, displayName: 'First' });
      const again = await expectRefusal(s.claim(h.display('192.0.2.2'), { code: spent, displayName: 'Second' }), 'claim_refused', 'a spent code');
      const expired = (await s.mint(a, A)).code;
      await h.advance(10 * MINUTE);
      const late = await expectRefusal(s.claim(h.display('192.0.2.3'), { code: expired, displayName: 'Late' }), 'claim_refused', 'an expired code');
      const unknown = await expectRefusal(s.claim(h.display('192.0.2.4'), { code: unusedCode(spent, expired), displayName: 'Guess' }), 'claim_refused', 'an unknown code');
      sameRefusal(again, late, 'spent and expired');
      sameRefusal(again, unknown, 'spent and unknown');
    },
    'a claim issues no token: collect gives pending with its check code': async (w) => {
      const d = w.h.display('192.0.2.1');
      const { claim } = await claimed(w, w.a, A, d, 'Counter');
      const result = await w.s.collect(d, claim.claimSecret);
      check(result.status === 'pending' && result.checkCode === claim.checkCode, `collect before the confirm gave ${JSON.stringify(result)}`);
    },
    'the check code matches on both screens, and two live claims never share one': async (w) => {
      const d = w.h.display('192.0.2.1');
      const first = await claimed(w, w.a, A, d, 'One');
      check(/^\d{4}$/.test(first.claim.checkCode), `check code ${first.claim.checkCode} is not 4 digits`);
      const listed = (await w.s.pending(w.a, A)).find((p) => p.claimId === first.claimId);
      const collected = await w.s.collect(d, first.claim.claimSecret);
      check(listed?.checkCode === first.claim.checkCode, 'the till lists another check code');
      check(collected.status === 'pending' && collected.checkCode === first.claim.checkCode, 'collect gives another check code');
      const second = await claimed(w, w.a, A, w.h.display('192.0.2.2'), 'Two');
      check(second.claim.checkCode !== first.claim.checkCode, 'two live claims share a check code');
    },
    'a confirm issues the token once, then collect is refused like an unknown secret': async (w) => {
      const { d, claim, token } = await paired(w, w.a, A, '192.0.2.1', 'Counter');
      check(SECRET.test(token), 'the token is not 22+ base64url characters');
      const again = await expectRefusal(w.s.collect(d, claim.claimSecret), 'collect_refused', 'a second collect');
      const unknown = await expectRefusal(w.s.collect(d, 'AAAAAAAAAAAAAAAAAAAAAA'), 'collect_refused', 'an unknown secret');
      sameRefusal(again, unknown, 'second collect and unknown secret');
    },
    'a decline, or an unconfirmed claim whose code expires, issues nothing': async (w) => {
      const d = w.h.display('192.0.2.1');
      const declined = await claimed(w, w.a, A, d, 'Declined');
      await w.s.decline(w.a, A, declined.claimId);
      await expectRefusal(w.s.collect(d, declined.claim.claimSecret), 'collect_refused', 'collect after a decline');
      const lapsed = await claimed(w, w.a, A, d, 'Lapsed');
      await w.h.advance(10 * MINUTE);
      await expectRefusal(w.s.collect(d, lapsed.claim.claimSecret), 'collect_refused', 'collect after the code expired');
      check((await w.h.storedCounts()).pending === 0, 'a pending pairing outlived its decline or its code');
    },
    'a confirm needs the capability and the minting device': async (w) => {
      const d = w.h.display('192.0.2.1');
      const { claim, claimId } = await claimed(w, w.a, A, d, 'Counter');
      await expectRefusal(w.s.confirm(w.viewer, A, claimId), 'forbidden', 'a confirm without the capability');
      await expectRefusal(w.s.confirm(w.b, B, claimId), 'not_found', 'a confirm from another device');
      check((await w.s.collect(d, claim.claimSecret)).status === 'pending', 'a refused confirm changed the claim');
    },
    'one source is limited to 10 failed claims a minute, and a limited claim spends nothing': async ({ h, s, a }) => {
      const { code } = await s.mint(a, A);
      const guesser = h.display('198.51.100.7');
      for (let i = 0; i < 10; i += 1) await expectRefusal(s.claim(guesser, { code: unusedCode(code), displayName: 'Guess' }), 'claim_refused', 'a wrong code');
      await expectRefusal(s.claim(guesser, { code, displayName: 'Guess' }), 'claim_refused', 'a valid code from a limited source');
      await s.claim(h.display('198.51.100.8'), { code, displayName: 'Other' });
      await h.advance(MINUTE);
      await s.claim(guesser, { code: (await s.mint(a, A)).code, displayName: 'Later' });
    },
    'two IPv6 addresses in one /64 share a limit': async ({ h, s, a }) => {
      const { code } = await s.mint(a, A);
      const one = h.display('2001:db8:0:1::5');
      const two = h.display('2001:db8:0:1:ffff::9');
      for (let i = 0; i < 10; i += 1) await expectRefusal(s.claim(i % 2 ? two : one, { code: unusedCode(code), displayName: 'Guess' }), 'claim_refused', 'a wrong code');
      await expectRefusal(s.claim(one, { code, displayName: 'Guess' }), 'claim_refused', 'a valid code from a limited /64');
      await expectRefusal(s.claim(two, { code, displayName: 'Guess' }), 'claim_refused', 'a valid code from a limited /64');
      await s.claim(h.display('2001:db8:0:2::5'), { code, displayName: 'Other' });
    },
    '100 failed claims store-wide pause every claim for 10 minutes': async ({ h, s, a }) => {
      const { code } = await s.mint(a, A);
      // 9 failures per address, so no source reaches its own limit of 10.
      for (let i = 0; i < 100; i += 1) await expectRefusal(s.claim(h.display(`203.0.113.${Math.floor(i / 9) + 1}`), { code: unusedCode(code), displayName: 'Guess' }), 'claim_refused', 'a wrong code');
      await expectRefusal(s.claim(h.display('203.0.113.200'), { code, displayName: 'Shop' }), 'claim_refused', 'a valid code while paused');
      await h.advance(10 * MINUTE);
      await s.claim(h.display('203.0.113.201'), { code: (await s.mint(a, A)).code, displayName: 'Shop' });
    },
    'the claim secret and the token are stored only as hashes': async (w) => {
      const { claim, token } = await paired(w, w.a, A, '192.0.2.1', 'Counter');
      const text = await w.h.storedText();
      check(SECRET.test(claim.claimSecret), 'the claim secret is not 22+ base64url characters');
      check(!text.includes(claim.claimSecret) && !text.includes(token), 'the claim secret or the token is stored');
      check(text.includes(await sha256Hex(token)), "the token's SHA-256 hex is not stored");
    },
    'the registry lists a display on its owning device only, and tracks connected': async (w) => {
      const { d, displayId, token } = await paired(w, w.a, A, '192.0.2.1', 'Counter');
      const row = (await w.s.list(w.a, A)).find((r) => r.displayId === displayId);
      check(row?.name === 'Counter' && row.cashierId === 'cashier-a', `the owner lists ${JSON.stringify(row)}`);
      check(!(await w.s.list(w.b, B)).some((r) => r.displayId === displayId), 'another device lists the display');
      await w.s.displayReceiveSignals(d, token);
      check((await w.s.list(w.a, A))[0]?.connected === true, 'a display just seen is not connected');
      await w.h.advance(31_000);
      check((await w.s.list(w.a, A))[0]?.connected === false, 'a display unseen for 31 s is connected');
    },
    'forget revokes the token, the row and the snapshot, for the owner only': async (w) => {
      const { d, displayId, token } = await paired(w, w.a, A, '192.0.2.1', 'Counter');
      await w.s.postSnapshot(w.a, A, displayId, { v: 1 });
      await w.s.displaySendSignal(d, token, { type: 'answer', payload: 'a1' });
      await expectRefusal(w.s.forget(w.b, B, displayId), 'not_found', 'forget from another device');
      check((await w.s.list(w.a, A)).length === 1, 'a refused forget removed the display');
      await w.s.forget(w.a, A, displayId);
      await expectRefusal(w.s.displayReceiveSignals(d, token), 'token_refused', 'a forgotten token');
      check((await w.s.list(w.a, A)).length === 0, 'the owner still lists a forgotten display');
      check((await w.s.receiveSignals(w.a, A)).every((m) => m.displayId !== displayId), 'the till received from a forgotten display');
      const counts = await w.h.storedCounts();
      check(counts.displays === 0 && counts.snapshots === 0, `forget left ${JSON.stringify(counts)}`);
    },
    'a display confirmed by a second till moves to it': async (w) => {
      const first = await paired(w, w.a, A, '192.0.2.1', 'Counter');
      await w.s.postSnapshot(w.a, A, first.displayId, { v: 1 });
      await w.s.sendSignal(w.a, A, first.displayId, { type: 'offer', payload: 'o1' });
      await w.s.displaySendSignal(first.d, first.token, { type: 'answer', payload: 'a1' });
      const moved = await paired(w, w.b, B, '192.0.2.1', 'Counter', first.token);
      check((await w.s.readSnapshot(moved.d, moved.token)) === null, "the first till's snapshot survived the move");
      check((await w.s.displayReceiveSignals(moved.d, moved.token)).length === 0, "the first till's signal survived the move");
      check((await w.h.storedCounts()).snapshots === 0, 'a snapshot is stored after the move');
      check((await w.s.receiveSignals(w.a, A)).every((m) => m.displayId !== first.displayId), 'the first till received from a moved display');
      check((await w.s.list(w.a, A)).length === 0, 'the first till still lists a moved display');
      check((await w.s.list(w.b, B)).some((r) => r.displayId === first.displayId) && moved.displayId === first.displayId, 'the moved display has a new id');
      await expectRefusal(w.s.readSnapshot(first.d, first.token), 'token_refused', 'the old token after a move');
    },
    'signals arrive once and in order, and only at their own display or till': async (w) => {
      const x = await paired(w, w.a, A, '192.0.2.1', 'X');
      const y = await paired(w, w.a, A, '192.0.2.2', 'Y');
      const z = await paired(w, w.b, B, '192.0.2.3', 'Z');
      await w.s.sendSignal(w.a, A, x.displayId, { type: 'offer', payload: 'o1' });
      await w.s.sendSignal(w.a, A, x.displayId, { type: 'ice', payload: 'i1' });
      const atX = await w.s.displayReceiveSignals(x.d, x.token);
      check(atX.map((m) => m.payload).join() === 'o1,i1', `display X received ${JSON.stringify(atX)}`);
      check((await w.s.displayReceiveSignals(x.d, x.token)).length === 0, 'display X received a message twice');
      check((await w.s.displayReceiveSignals(y.d, y.token)).length === 0, "display Y received display X's messages");
      await w.s.displaySendSignal(x.d, x.token, { type: 'answer', payload: 'a1' });
      await w.s.displaySendSignal(x.d, x.token, { type: 'ice', payload: 'i2' });
      await w.s.displaySendSignal(z.d, z.token, { type: 'answer', payload: 'z1' });
      check((await w.s.receiveSignals(w.b, B)).every((m) => m.displayId === z.displayId), "device B received device A's display");
      const atA = await w.s.receiveSignals(w.a, A);
      check(atA.map((m) => `${m.displayId === x.displayId}:${m.payload}`).join() === 'true:a1,true:i2', `till A received ${JSON.stringify(atA)}`);
      check((await w.s.receiveSignals(w.a, A)).length === 0, 'till A received a message twice');
    },
    'the snapshot needs the token, keeps the latest body for 60 s, and refuses over 200 KiB': async (w) => {
      const { d, displayId, token } = await paired(w, w.a, A, '192.0.2.1', 'Counter');
      await expectRefusal(w.s.readSnapshot(d, 'not-a-token-not-a-token'), 'token_refused', 'a read without the token');
      await w.s.postSnapshot(w.a, A, displayId, { seq: 1 });
      await w.s.postSnapshot(w.a, A, displayId, { seq: 2 });
      check(JSON.stringify(await w.s.readSnapshot(d, token)) === '{"seq":2}', 'the latest snapshot is not served');
      await w.h.advance(61_000);
      check((await w.s.readSnapshot(d, token)) === null, 'a snapshot outlived 60 s');
      await w.s.postSnapshot(w.a, A, displayId, { seq: 3 });
      await expectRefusal(w.s.postSnapshot(w.a, A, displayId, { pad: 'x'.repeat(204_800) }), 'too_large', 'a snapshot over 200 KiB');
      check(JSON.stringify(await w.s.readSnapshot(d, token)) === '{"seq":3}', 'a refused snapshot replaced the previous one');
    },
    'expired codes and displays unseen for 30 days are pruned': async (w) => {
      const { d, token } = await paired(w, w.a, A, '192.0.2.1', 'Counter');
      await w.s.mint(w.a, A);
      await w.h.advance(10 * MINUTE);
      await w.s.list(w.a, A);
      check((await w.h.storedCounts()).codes === 0, 'an expired code is still stored');
      await w.h.advance(30 * DAY);
      await w.s.list(w.a, A);
      check((await w.h.storedCounts()).displays === 0, 'a display unseen for 30 days is still stored');
      await expectRefusal(w.s.readSnapshot(d, token), 'token_refused', 'a pruned display');
    },
  };
  return Object.entries(cases).map(([name, run]) => ({ name, run: async () => run(await world(makeHarness)) }));
}
