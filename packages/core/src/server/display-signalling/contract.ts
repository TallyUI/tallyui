import type { SyncContext } from '../../types/connector';
import type { DisplaySignalling, DisplaySignallingContext, DisplaySignallingErrorCode, TillDevice } from '../../types/display-signalling';
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

const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** A random 22-character base64url key, which no device holds. */
const randomKey = (): string => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(22)), (n) => KEY_ALPHABET[n & 63]).join('');

interface World { h: DisplaySignallingHarness; s: DisplaySignalling; a: SyncContext; b: SyncContext; viewer: SyncContext; da: TillDevice; db: TillDevice }

async function world(make: () => Promise<DisplaySignallingHarness>): Promise<World> {
  const h = await make();
  const till = (cashierId: string, canPair = true) => h.till({ cashierId, canPair });
  const [a, b, viewer] = [await till('cashier-a'), await till('cashier-b'), await till('cashier-viewer', false)];
  const da = { deviceId: A, deviceKey: (await h.signalling.registerDevice(a, A)).deviceKey };
  const db = { deviceId: B, deviceKey: (await h.signalling.registerDevice(b, B)).deviceKey };
  return { h, s: h.signalling, a, b, viewer, da, db };
}

/** Claims a fresh code from `device`, giving the claim and its pending pairing's id. */
async function claimed(w: World, ctx: SyncContext, device: TillDevice, d: DisplaySignallingContext, name: string, token?: string) {
  const { code } = await w.s.mint(ctx, device);
  const claim = await w.s.claim(d, { code, displayName: name, ...(token ? { token } : {}) });
  const entry = (await w.s.pending(ctx, device)).find((p) => p.checkCode === claim.checkCode);
  check(entry && entry.displayName === name, `the pending listing lacks the claim by ${name}`);
  return { code, claim, claimId: entry.claimId };
}

/** Pairs a display with `device` end to end: mint, claim, confirm, collect. */
async function paired(w: World, ctx: SyncContext, device: TillDevice, source: string, name: string, token?: string) {
  const d = w.h.display(source);
  const { claim, claimId } = await claimed(w, ctx, device, d, name, token);
  await w.s.confirm(ctx, device, claimId);
  const result = await w.s.collect(d, claim.claimSecret);
  check(result.status === 'paired', `collect after the confirm gave ${result.status}`);
  return { d, claim, displayId: result.displayId, token: result.token };
}

/** A's display with a snapshot and a signal waiting for the till, and a pending claim: something for every till call to touch. */
async function armed(w: World) {
  const shown = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
  await w.s.postSnapshot(w.a, w.da, shown.displayId, { v: 1 });
  await w.s.displaySendSignal(shown.d, shown.token, { type: 'answer', payload: 'a1' });
  const { claimId } = await claimed(w, w.a, w.da, w.h.display('192.0.2.2'), 'Waiting');
  return { ...shown, claimId };
}

/** Each of the nine till-side calls, made by cashier A with `device`. */
const tillCalls = (w: World, device: TillDevice, displayId: string, claimId: string): Array<[string, () => Promise<unknown>]> => [
  ['mint', () => w.s.mint(w.a, device)], ['pending', () => w.s.pending(w.a, device)],
  ['confirm', () => w.s.confirm(w.a, device, claimId)], ['decline', () => w.s.decline(w.a, device, claimId)],
  ['list', () => w.s.list(w.a, device)], ['forget', () => w.s.forget(w.a, device, displayId)],
  ['sendSignal', () => w.s.sendSignal(w.a, device, displayId, { type: 'offer', payload: 'o2' })],
  ['receiveSignals', () => w.s.receiveSignals(w.a, device)], ['postSnapshot', () => w.s.postSnapshot(w.a, device, displayId, { v: 2 })],
];

/** The four devices no till call accepts: no key, a random key, B's key on A's id, and A's key on an id never registered. */
const refusedDevices = (w: World): Array<[string, TillDevice]> => [
  ['a missing key', { deviceId: A, deviceKey: '' }], ['a wrong key', { deviceId: A, deviceKey: randomKey() }],
  ["B's key on A's id", { deviceId: A, deviceKey: w.db.deviceKey }], ['an unregistered id', { deviceId: 'till-never', deviceKey: w.da.deviceKey }],
];

/** Seeds a pre-migration till and lets cashier A's register adopt it. */
async function adopted(w: World) {
  const legacy = await w.h.seedLegacyDevice('till-legacy');
  const device = { deviceId: 'till-legacy', deviceKey: (await w.s.registerDevice(w.a, 'till-legacy')).deviceKey };
  return { ...legacy, device };
}

/**
 * The security floor of ADR-085 d4–d6 and d8, and #705, as runner-agnostic cases: each builds a fresh harness and
 * throws on failure. Each plugin's connector runs it against its own routes:
 * `for (const c of displaySignallingContract(make)) it(c.name, c.run);`
 */
export function displaySignallingContract(makeHarness: () => Promise<DisplaySignallingHarness>): Array<{ name: string; run: () => Promise<void> }> {
  const cases: Record<string, (w: World) => Promise<void>> = {
    'mint without the capability is forbidden and makes no code': async ({ h, s, viewer, da }) => {
      await expectRefusal(s.mint(viewer, da), 'forbidden', 'mint without the capability');
      check((await h.storedCounts()).codes === 0, 'a refused mint stored a code');
    },
    'a minted code is at least 6 digits and expires within 10 minutes': async ({ h, s, a, da }) => {
      const { code, expiresAt } = await s.mint(a, da);
      check(/^\d{6,}$/.test(code), `code ${code} is not 6 or more digits`);
      check(!Number.isNaN(Date.parse(expiresAt)), `expiresAt ${expiresAt} is not a date`);
      await h.advance(10 * MINUTE);
      await expectRefusal(s.claim(h.display('192.0.2.1'), { code, displayName: 'Late' }), 'claim_refused', 'a claim 10 minutes after the mint');
    },
    'a device holds at most 5 unspent codes, and expired codes stop counting': async ({ h, s, a, da }) => {
      for (let i = 0; i < 5; i += 1) await s.mint(a, da);
      await expectRefusal(s.mint(a, da), 'limit', 'the 6th unspent code');
      await h.advance(10 * MINUTE);
      await s.mint(a, da);
    },
    'spent, expired and unknown codes get the same claim refusal': async ({ h, s, a, da }) => {
      const spent = (await s.mint(a, da)).code;
      await s.claim(h.display('192.0.2.1'), { code: spent, displayName: 'First' });
      const again = await expectRefusal(s.claim(h.display('192.0.2.2'), { code: spent, displayName: 'Second' }), 'claim_refused', 'a spent code');
      const expired = (await s.mint(a, da)).code;
      await h.advance(10 * MINUTE);
      const late = await expectRefusal(s.claim(h.display('192.0.2.3'), { code: expired, displayName: 'Late' }), 'claim_refused', 'an expired code');
      const unknown = await expectRefusal(s.claim(h.display('192.0.2.4'), { code: unusedCode(spent, expired), displayName: 'Guess' }), 'claim_refused', 'an unknown code');
      sameRefusal(again, late, 'spent and expired');
      sameRefusal(again, unknown, 'spent and unknown');
    },
    'a claim issues no token: collect gives pending with its check code': async (w) => {
      const d = w.h.display('192.0.2.1');
      const { claim } = await claimed(w, w.a, w.da, d, 'Counter');
      const result = await w.s.collect(d, claim.claimSecret);
      check(result.status === 'pending' && result.checkCode === claim.checkCode, `collect before the confirm gave ${JSON.stringify(result)}`);
    },
    'the check code matches on both screens, and two live claims never share one': async (w) => {
      const d = w.h.display('192.0.2.1');
      const first = await claimed(w, w.a, w.da, d, 'One');
      check(/^\d{4}$/.test(first.claim.checkCode), `check code ${first.claim.checkCode} is not 4 digits`);
      const listed = (await w.s.pending(w.a, w.da)).find((p) => p.claimId === first.claimId);
      const collected = await w.s.collect(d, first.claim.claimSecret);
      check(listed?.checkCode === first.claim.checkCode, 'the till lists another check code');
      check(collected.status === 'pending' && collected.checkCode === first.claim.checkCode, 'collect gives another check code');
      const second = await claimed(w, w.a, w.da, w.h.display('192.0.2.2'), 'Two');
      check(second.claim.checkCode !== first.claim.checkCode, 'two live claims share a check code');
    },
    'a confirm issues the token once, then collect is refused like an unknown secret': async (w) => {
      const { d, claim, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      check(SECRET.test(token), 'the token is not 22+ base64url characters');
      const again = await expectRefusal(w.s.collect(d, claim.claimSecret), 'collect_refused', 'a second collect');
      const unknown = await expectRefusal(w.s.collect(d, 'AAAAAAAAAAAAAAAAAAAAAA'), 'collect_refused', 'an unknown secret');
      sameRefusal(again, unknown, 'second collect and unknown secret');
    },
    'a decline, or an unconfirmed claim whose code expires, issues nothing': async (w) => {
      const d = w.h.display('192.0.2.1');
      const declined = await claimed(w, w.a, w.da, d, 'Declined');
      await w.s.decline(w.a, w.da, declined.claimId);
      await expectRefusal(w.s.collect(d, declined.claim.claimSecret), 'collect_refused', 'collect after a decline');
      const lapsed = await claimed(w, w.a, w.da, d, 'Lapsed');
      await w.h.advance(10 * MINUTE);
      await expectRefusal(w.s.collect(d, lapsed.claim.claimSecret), 'collect_refused', 'collect after the code expired');
      check((await w.h.storedCounts()).pending === 0, 'a pending pairing outlived its decline or its code');
    },
    'a confirm needs the capability and the minting device': async (w) => {
      const d = w.h.display('192.0.2.1');
      const { claim, claimId } = await claimed(w, w.a, w.da, d, 'Counter');
      await expectRefusal(w.s.confirm(w.viewer, w.da, claimId), 'forbidden', 'a confirm without the capability');
      await expectRefusal(w.s.confirm(w.b, w.db, claimId), 'not_found', 'a confirm from another device');
      check((await w.s.collect(d, claim.claimSecret)).status === 'pending', 'a refused confirm changed the claim');
    },
    'one source is limited to 10 failed claims a minute, and a limited claim spends nothing': async ({ h, s, a, da }) => {
      const { code } = await s.mint(a, da);
      const guesser = h.display('198.51.100.7');
      for (let i = 0; i < 10; i += 1) await expectRefusal(s.claim(guesser, { code: unusedCode(code), displayName: 'Guess' }), 'claim_refused', 'a wrong code');
      await expectRefusal(s.claim(guesser, { code, displayName: 'Guess' }), 'claim_refused', 'a valid code from a limited source');
      await s.claim(h.display('198.51.100.8'), { code, displayName: 'Other' });
      await h.advance(MINUTE);
      await s.claim(guesser, { code: (await s.mint(a, da)).code, displayName: 'Later' });
    },
    'two IPv6 addresses in one /64 share a limit': async ({ h, s, a, da }) => {
      const { code } = await s.mint(a, da);
      const one = h.display('2001:db8:0:1::5');
      const two = h.display('2001:db8:0:1:ffff::9');
      for (let i = 0; i < 10; i += 1) await expectRefusal(s.claim(i % 2 ? two : one, { code: unusedCode(code), displayName: 'Guess' }), 'claim_refused', 'a wrong code');
      await expectRefusal(s.claim(one, { code, displayName: 'Guess' }), 'claim_refused', 'a valid code from a limited /64');
      await expectRefusal(s.claim(two, { code, displayName: 'Guess' }), 'claim_refused', 'a valid code from a limited /64');
      await s.claim(h.display('2001:db8:0:2::5'), { code, displayName: 'Other' });
    },
    '100 failed claims store-wide pause every claim for 10 minutes': async ({ h, s, a, da }) => {
      const { code } = await s.mint(a, da);
      // 9 failures per address, so no source reaches its own limit of 10.
      for (let i = 0; i < 100; i += 1) await expectRefusal(s.claim(h.display(`203.0.113.${Math.floor(i / 9) + 1}`), { code: unusedCode(code), displayName: 'Guess' }), 'claim_refused', 'a wrong code');
      await expectRefusal(s.claim(h.display('203.0.113.200'), { code, displayName: 'Shop' }), 'claim_refused', 'a valid code while paused');
      await h.advance(10 * MINUTE);
      await s.claim(h.display('203.0.113.201'), { code: (await s.mint(a, da)).code, displayName: 'Shop' });
    },
    'the claim secret and the token are stored only as hashes': async (w) => {
      const { claim, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const text = await w.h.storedText();
      check(SECRET.test(claim.claimSecret), 'the claim secret is not 22+ base64url characters');
      check(!text.includes(claim.claimSecret) && !text.includes(token), 'the claim secret or the token is stored');
      check(text.includes(await sha256Hex(token)), "the token's SHA-256 hex is not stored");
    },
    'the registry lists a display on its owning device only, and tracks connected': async (w) => {
      const { d, displayId, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const row = (await w.s.list(w.a, w.da)).find((r) => r.displayId === displayId);
      check(row?.name === 'Counter' && row.cashierId === 'cashier-a', `the owner lists ${JSON.stringify(row)}`);
      check(!(await w.s.list(w.b, w.db)).some((r) => r.displayId === displayId), 'another device lists the display');
      await w.s.displayReceiveSignals(d, token);
      check((await w.s.list(w.a, w.da))[0]?.connected === true, 'a display just seen is not connected');
      await w.h.advance(31_000);
      check((await w.s.list(w.a, w.da))[0]?.connected === false, 'a display unseen for 31 s is connected');
    },
    'forget revokes the token, the row and the snapshot, for the owner only': async (w) => {
      const { d, displayId, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await w.s.postSnapshot(w.a, w.da, displayId, { v: 1 });
      await w.s.displaySendSignal(d, token, { type: 'answer', payload: 'a1' });
      await expectRefusal(w.s.forget(w.b, w.db, displayId), 'not_found', 'forget from another device');
      check((await w.s.list(w.a, w.da)).length === 1, 'a refused forget removed the display');
      await w.s.forget(w.a, w.da, displayId);
      await expectRefusal(w.s.displayReceiveSignals(d, token), 'token_refused', 'a forgotten token');
      check((await w.s.list(w.a, w.da)).length === 0, 'the owner still lists a forgotten display');
      check((await w.s.receiveSignals(w.a, w.da)).every((m) => m.displayId !== displayId), 'the till received from a forgotten display');
      const counts = await w.h.storedCounts();
      check(counts.displays === 0 && counts.snapshots === 0, `forget left ${JSON.stringify(counts)}`);
    },
    'a display confirmed by a second till moves to it': async (w) => {
      const first = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await w.s.postSnapshot(w.a, w.da, first.displayId, { v: 1 });
      await w.s.sendSignal(w.a, w.da, first.displayId, { type: 'offer', payload: 'o1' });
      await w.s.displaySendSignal(first.d, first.token, { type: 'answer', payload: 'a1' });
      const moved = await paired(w, w.b, w.db, '192.0.2.1', 'Counter', first.token);
      check((await w.s.readSnapshot(moved.d, moved.token)) === null, "the first till's snapshot survived the move");
      check((await w.s.displayReceiveSignals(moved.d, moved.token)).length === 0, "the first till's signal survived the move");
      check((await w.h.storedCounts()).snapshots === 0, 'a snapshot is stored after the move');
      check((await w.s.receiveSignals(w.a, w.da)).every((m) => m.displayId !== first.displayId), 'the first till received from a moved display');
      check((await w.s.list(w.a, w.da)).length === 0, 'the first till still lists a moved display');
      check((await w.s.list(w.b, w.db)).some((r) => r.displayId === first.displayId) && moved.displayId === first.displayId, 'the moved display has a new id');
      await expectRefusal(w.s.readSnapshot(first.d, first.token), 'token_refused', 'the old token after a move');
    },
    'signals arrive once and in order, and only at their own display or till': async (w) => {
      const x = await paired(w, w.a, w.da, '192.0.2.1', 'X');
      const y = await paired(w, w.a, w.da, '192.0.2.2', 'Y');
      const z = await paired(w, w.b, w.db, '192.0.2.3', 'Z');
      await w.s.sendSignal(w.a, w.da, x.displayId, { type: 'offer', payload: 'o1' });
      await w.s.sendSignal(w.a, w.da, x.displayId, { type: 'ice', payload: 'i1' });
      const atX = await w.s.displayReceiveSignals(x.d, x.token);
      check(atX.map((m) => m.payload).join() === 'o1,i1', `display X received ${JSON.stringify(atX)}`);
      check((await w.s.displayReceiveSignals(x.d, x.token)).length === 0, 'display X received a message twice');
      check((await w.s.displayReceiveSignals(y.d, y.token)).length === 0, "display Y received display X's messages");
      await w.s.displaySendSignal(x.d, x.token, { type: 'answer', payload: 'a1' });
      await w.s.displaySendSignal(x.d, x.token, { type: 'ice', payload: 'i2' });
      await w.s.displaySendSignal(z.d, z.token, { type: 'answer', payload: 'z1' });
      check((await w.s.receiveSignals(w.b, w.db)).every((m) => m.displayId === z.displayId), "device B received device A's display");
      const atA = await w.s.receiveSignals(w.a, w.da);
      check(atA.map((m) => `${m.displayId === x.displayId}:${m.payload}`).join() === 'true:a1,true:i2', `till A received ${JSON.stringify(atA)}`);
      check((await w.s.receiveSignals(w.a, w.da)).length === 0, 'till A received a message twice');
    },
    'the snapshot needs the token, keeps the latest body for 60 s, and refuses over 200 KiB': async (w) => {
      const { d, displayId, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await expectRefusal(w.s.readSnapshot(d, 'not-a-token-not-a-token'), 'token_refused', 'a read without the token');
      await w.s.postSnapshot(w.a, w.da, displayId, { seq: 1 });
      await w.s.postSnapshot(w.a, w.da, displayId, { seq: 2 });
      check(JSON.stringify(await w.s.readSnapshot(d, token)) === '{"seq":2}', 'the latest snapshot is not served');
      await w.h.advance(61_000);
      check((await w.s.readSnapshot(d, token)) === null, 'a snapshot outlived 60 s');
      await w.s.postSnapshot(w.a, w.da, displayId, { seq: 3 });
      await expectRefusal(w.s.postSnapshot(w.a, w.da, displayId, { pad: 'x'.repeat(204_800) }), 'too_large', 'a snapshot over 200 KiB');
      check(JSON.stringify(await w.s.readSnapshot(d, token)) === '{"seq":3}', 'a refused snapshot replaced the previous one');
    },
    'expired codes and displays unseen for 30 days are pruned': async (w) => {
      const { d, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await w.s.mint(w.a, w.da);
      await w.h.advance(10 * MINUTE);
      await w.s.list(w.a, w.da);
      check((await w.h.storedCounts()).codes === 0, 'an expired code is still stored');
      await w.h.advance(30 * DAY);
      await w.s.list(w.a, w.da);
      check((await w.h.storedCounts()).displays === 0, 'a display unseen for 30 days is still stored');
      await expectRefusal(w.s.readSnapshot(d, token), 'token_refused', 'a pruned display');
    },
    'K1: registerDevice needs the capability, and issues a 22+ character base64url key': async (w) => {
      const before = (await w.h.storedCounts()).devices;
      await expectRefusal(w.s.registerDevice(w.viewer, 'till-c'), 'forbidden', 'a register without the capability');
      check((await w.h.storedCounts()).devices === before, 'a refused register stored a device');
      check(SECRET.test((await w.s.registerDevice(w.a, 'till-c')).deviceKey), 'the device key is not 22+ base64url characters');
    },
    'K2: an id that holds a key cannot register again, by any cashier': async (w) => {
      await expectRefusal(w.s.registerDevice(w.a, A), 'device_refused', 'a second register by the same cashier');
      await expectRefusal(w.s.registerDevice(w.b, A), 'device_refused', 'a second register by another cashier');
      await w.s.list(w.a, w.da);
    },
    'K3: every till call refuses a missing, wrong, swapped or unregistered key the same way': async (w) => {
      const { displayId, claimId } = await armed(w);
      for (const [method] of tillCalls(w, w.da, displayId, claimId)) {
        const refusals: Error[] = [];
        for (const [what, device] of refusedDevices(w)) {
          const call = tillCalls(w, device, displayId, claimId).find(([name]) => name === method)![1];
          refusals.push(await expectRefusal(call(), 'device_refused', `${method} with ${what}`));
        }
        refusals.forEach((refusal, i) => sameRefusal(refusals[0], refusal, `${method}: refusal ${i}`));
      }
    },
    'K4: a refused till call has no effect': async (w) => {
      const { d, token, displayId, claimId } = await armed(w);
      const before = JSON.stringify(await w.h.storedCounts());
      for (const [, device] of refusedDevices(w)) {
        for (const [method, call] of tillCalls(w, device, displayId, claimId)) await expectRefusal(call(), 'device_refused', method);
      }
      const after = JSON.stringify(await w.h.storedCounts());
      check(after === before, `refused calls changed the stored counts from ${before} to ${after}`);
      check(JSON.stringify(await w.s.readSnapshot(d, token)) === '{"v":1}', 'a refused postSnapshot replaced the snapshot');
      check((await w.s.displayReceiveSignals(d, token)).length === 0, 'a refused sendSignal queued a message');
      check((await w.s.receiveSignals(w.a, w.da)).map((m) => m.payload).join() === 'a1', 'a refused receiveSignals drained the inbox');
    },
    'K5: a wrong key gets device_refused, never not_found, on an owned and on a foreign display': async (w) => {
      const own = await paired(w, w.a, w.da, '192.0.2.1', 'Own');
      const foreign = await paired(w, w.b, w.db, '192.0.2.2', 'Foreign');
      const wrong = { deviceId: A, deviceKey: w.db.deviceKey };
      const onOwn = await expectRefusal(w.s.forget(w.a, wrong, own.displayId), 'device_refused', 'a wrong key on an owned display');
      const onForeign = await expectRefusal(w.s.forget(w.a, wrong, foreign.displayId), 'device_refused', 'a wrong key on a foreign display');
      sameRefusal(onOwn, onForeign, 'owned and foreign displays');
      await expectRefusal(w.s.postSnapshot(w.a, wrong, foreign.displayId, { v: 1 }), 'device_refused', 'a wrong key posting to a foreign display');
    },
    'K6: the device key is stored only as its SHA-256 hex': async (w) => {
      const text = await w.h.storedText();
      check(!text.includes(w.da.deviceKey) && !text.includes(w.db.deviceKey), 'a device key is stored');
      check(text.includes(await sha256Hex(w.da.deviceKey)), "the device key's SHA-256 hex is not stored");
    },
    'K7: a pre-migration till adopts its displays at its first register': async (w) => {
      const legacy = await w.h.seedLegacyDevice('till-legacy');
      await expectRefusal(w.s.registerDevice(w.viewer, 'till-legacy'), 'forbidden', 'a register without the capability');
      check((await w.h.adoptionLog()).length === 0, 'a refused register adopted');
      const before = JSON.stringify(await w.h.storedCounts());
      for (const [what, deviceKey] of [['no key', ''], ['a random key', randomKey()]] as const) {
        const keyless = { deviceId: 'till-legacy', deviceKey };
        await expectRefusal(w.s.list(w.a, keyless), 'device_refused', `list with ${what} before the adoption`);
        await expectRefusal(w.s.mint(w.a, keyless), 'device_refused', `mint with ${what} before the adoption`);
      }
      const after = JSON.stringify(await w.h.storedCounts());
      check(after === before, `refused pre-adoption calls changed the stored counts from ${before} to ${after}`);
      const device = { deviceId: 'till-legacy', deviceKey: (await w.s.registerDevice(w.a, 'till-legacy')).deviceKey };
      check(SECRET.test(device.deviceKey), 'the adopting key is not 22+ base64url characters');
      check((await w.s.list(w.a, device)).some((r) => r.displayId === legacy.displayId), 'the adopted till does not list its display');
      await w.s.readSnapshot(w.h.display('192.0.2.1'), legacy.token);
      const log = JSON.stringify(await w.h.adoptionLog());
      check(log === JSON.stringify([{ deviceId: 'till-legacy', cashierId: 'cashier-a' }]), `the adoption log is ${log}`);
    },
    'K8: an adoption cannot repeat': async (w) => {
      const { device } = await adopted(w);
      await expectRefusal(w.s.registerDevice(w.b, 'till-legacy'), 'device_refused', 'a second adoption by another cashier');
      await expectRefusal(w.s.registerDevice(w.a, 'till-legacy'), 'device_refused', 'a second adoption by the same cashier');
      check((await w.h.adoptionLog()).length === 1, 'the adoption log has more than one entry');
      await w.s.list(w.a, device);
    },
    'K9: a device that owns nothing and makes no till call for over 30 days is pruned, and its id registers again': async (w) => {
      const old = { deviceId: 'till-idle', deviceKey: (await w.s.registerDevice(w.a, 'till-idle')).deviceKey };
      const shown = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await w.h.advance(29 * DAY);
      await expectRefusal(w.s.list(w.a, { deviceId: 'till-idle', deviceKey: randomKey() }), 'device_refused', 'a wrong key on an idle device');
      await w.s.readSnapshot(shown.d, shown.token);
      await w.h.advance(2 * DAY);
      check((await w.s.list(w.a, w.da)).some((r) => r.displayId === shown.displayId), 'a device that owns a live row was pruned');
      const fresh = (await w.s.registerDevice(w.a, 'till-idle')).deviceKey;
      check(fresh !== old.deviceKey, 'the re-registered id got its old key');
      await expectRefusal(w.s.list(w.a, old), 'device_refused', 'the key of a pruned device');
      await w.s.list(w.a, { deviceId: 'till-idle', deviceKey: fresh });
    },
    'R1: renewal returns a fresh usable token and expiry (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const next = await w.s.renew(d, token);
      check(SECRET.test(next.token) && next.token !== token, 'renew did not issue a fresh base64url token');
      check(Number.isFinite(Date.parse(next.expiresAt)), 'renew returned an invalid expiry');
      await w.s.readSnapshot(d, next.token);
      const stored = await w.h.storedText();
      check(!stored.includes(token) && !stored.includes(next.token), 'a token is stored in plain text');
      check(stored.includes(await sha256Hex(next.token)), 'the successor hash is not stored');
    },
    'R2: the successor works just before two days (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const next = await w.s.renew(d, token);
      await w.h.advance(2 * DAY - MINUTE);
      await w.s.readSnapshot(d, next.token);
    },
    'R3: the previous token still works for snapshot and signals at 59 seconds (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token, displayId } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await w.s.renew(d, token);
      await w.s.postSnapshot(w.a, w.da, displayId, 'overlap');
      await w.h.advance(59_000);
      check(await w.s.readSnapshot(d, token) === 'overlap', 'the previous token cannot read the snapshot');
      await w.s.displaySendSignal(d, token, { type: 'answer', payload: 'a1' });
      await w.s.displayReceiveSignals(d, token);
    },
    'R4: a lost-answer retry replaces only the unseen successor (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token, displayId } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const unseen = await w.s.renew(d, token);
      await w.h.advance(30_000);
      const fresh = await w.s.renew(d, token);
      check(fresh.token !== unseen.token && fresh.token !== token, 'the retry did not issue a fresh successor');
      await expectRefusal(w.s.readSnapshot(d, unseen.token), 'token_refused', 'an unseen replaced successor');
      await w.s.readSnapshot(d, fresh.token);
      check((await w.s.list(w.a, w.da)).some((row) => row.displayId === displayId), 'the retry lost the display');
    },
    'R5: renewing the previous token after its successor was seen revokes the display (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const next = await w.s.renew(d, token);
      await w.s.readSnapshot(d, next.token);
      await expectRefusal(w.s.renew(d, token).then(() => undefined), 'token_refused', 'renew after successor use');
      await expectRefusal(w.s.readSnapshot(d, next.token), 'token_refused', 'the revoked successor');
      check((await w.s.list(w.a, w.da)).length === 0, 'the revoked display is still listed');
    },
    'R6: using the previous token after the overlap drops the display and snapshot (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token, displayId } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const next = await w.s.renew(d, token);
      await w.h.advance(10 * MINUTE + 1000);
      await w.s.postSnapshot(w.a, w.da, displayId, 'live');
      await expectRefusal(w.s.readSnapshot(d, token), 'token_refused', 'the previous token after overlap');
      await expectRefusal(w.s.readSnapshot(d, next.token), 'token_refused', 'the revoked successor');
      check((await w.s.list(w.a, w.da)).length === 0, 'the revoked display is still listed');
      check((await w.h.storedCounts()).snapshots === 0, 'revocation left a snapshot');
    },
    'R7: a lost-answer retry cannot extend the original overlap (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await w.s.renew(d, token);
      await w.h.advance(59_000);
      await w.s.renew(d, token);
      await w.h.advance(10 * MINUTE + 1000 - 59_000);
      await expectRefusal(w.s.readSnapshot(d, token), 'token_refused', 'previous token after the original overlap');
    },
    'R8: the successor is refused after its advertised expiry (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const mint = await w.s.mint(w.a, w.da);
      const next = await w.s.renew(d, token);
      const elapsed = Date.parse(next.expiresAt) - Date.parse(mint.expiresAt) + 10 * MINUTE + 1000;
      await w.h.advance(DAY);
      await w.s.readSnapshot(d, next.token);
      await w.h.advance(elapsed - DAY);
      await expectRefusal(w.s.readSnapshot(d, next.token), 'token_refused', 'the expired successor');
    },
    'R9: unknown and forgotten tokens cannot renew (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token, displayId } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      const before = JSON.stringify(await w.h.storedCounts());
      const unknown = await expectRefusal(w.s.renew(d, randomKey()).then(() => undefined), 'token_refused', 'renew an unknown token');
      check(JSON.stringify(await w.h.storedCounts()) === before, 'an unknown token changed the stored counts');
      await w.s.forget(w.a, w.da, displayId);
      const forgotten = await expectRefusal(w.s.renew(d, token).then(() => undefined), 'token_refused', 'renew a forgotten token');
      sameRefusal(unknown, forgotten, 'unknown and forgotten tokens');
    },
    'R10: renewal marks the display seen (ADR-096)': async (w) => {
      if (!w.s.renew) return;
      const { d, token, displayId } = await paired(w, w.a, w.da, '192.0.2.1', 'Counter');
      await w.s.renew(d, token);
      const row = (await w.s.list(w.a, w.da)).find((entry) => entry.displayId === displayId);
      check(row && row.lastSeenAt !== null, 'renew did not mark the display seen');
    },
  };
  return Object.entries(cases).map(([name, run]) => ({ name, run: async () => run(await world(makeHarness)) }));
}
