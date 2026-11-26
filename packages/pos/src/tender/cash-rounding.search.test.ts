// ADR-094 items 1, 6 and 7 (carry rule, 2026-11-26): a search over the till's cash moves, asserting that the sum S of the live
// cashRoundings stays in R(mode), the range of roundToIncrement(u) - u, in every reached state, and that no open sale is stranded.
// The model calls the real helpers below. The settle, pick and promotion branches of useSale.addTender are not exported, so the
// model copies them from use-sale.ts:943-1001 (pick amount :943, promotion :950-955, pick cap :957, settle :968-998) and
// voidTender's refusal from :1026; the useSale replays in packages/components/src/__tests__/tender-cash-roundings.test.tsx (C1-C16)
// keep those copies honest.
import { describe, expect, it } from 'vitest';
import type { PaymentRounding } from '@tallyui/core';
import { CASH_PICK_ENTRIES_MAX } from '../sale/use-sale';
import { cashVoidRefusal, remainderEntriesMinor, roundedPickTarget, roundedRemainder, roundToIncrement, settlesAtRoundedDue, writeOffLeg } from './cash-rounding';

type Rule = NonNullable<PaymentRounding>;
type Leg = { id: string; method: 'cash' | 'card'; amt: number; line?: number; pick: boolean; live: boolean; locked?: boolean };
type St = { legs: Leg[]; entry: Record<string, number>; n: number; ops: string[] };

/** R(mode): the range of roundToIncrement(u) - u. */
const inR = (rule: Rule, x: number) => {
  const i = rule.incrementMinor;
  return rule.mode === 'nearest' ? 2 * x > -i && 2 * x <= i : rule.mode === 'up' ? x >= 0 && x < i : x <= 0 && x > -i;
};

function model(goods: number[], rule: Rule) {
  const G = goods.reduce((a, b) => a + b, 0);
  const inc = rule.incrementMinor;
  const live = (s: St) => s.legs.filter((l) => l.live);
  /** The builder's cashRoundings: one entry per live leg, merged; a merge to 0 removes it (order-builder addCashRounding). */
  const entries = (s: St) => live(s).filter((l) => (s.entry[l.id] ?? 0) !== 0).map((l) => ({ paymentId: l.id, minor: s.entry[l.id] }));
  const S = (s: St) => entries(s).reduce((a, e) => a + e.minor, 0);
  const paid = (s: St) => live(s).reduce((a, l) => a + l.amt, 0);
  const bal = (s: St) => Math.max(0, G + S(s) - paid(s));
  const closed = (s: St) => bal(s) === 0 && paid(s) > 0;
  const snap = (s: St) => ({
    payments: s.legs.map((l) => ({ id: l.id, method: l.method === 'cash' ? 'cash' : 'external', status: l.live ? ('captured' as const) : ('voided' as const), ...(l.pick ? { units: { [String(l.line)]: 1 } } : {}) })),
    cashRoundings: entries(s),
  });
  const held = (s: St) => new Set(live(s).filter((l) => l.pick).map((l) => l.line!));
  const add = (s: St, leg: Omit<Leg, 'id' | 'live'>, entry: number, op: string): St => {
    const id = `L${s.n}`;
    return { legs: [...s.legs, { ...leg, id, live: true }], entry: entry !== 0 ? { ...s.entry, [id]: entry } : s.entry, n: s.n + 1, ops: [...s.ops, op] };
  };
  /** use-sale.ts:968-998, the cash leg with no tenderedMinor (a settle, a whole pick when `line` is set, or a plain part payment). */
  const cashSettle = (s: St, t: number, line: number | undefined, op: string): St | null => {
    const due = bal(s);
    if (due <= 0) return null;
    const dueMinor = roundedRemainder(due, remainderEntriesMinor(snap(s)), rule);
    if (settlesAtRoundedDue({ amountMinor: Math.min(t, due), tenderedMinor: t, balanceMinor: due, dueMinor })) {
      const w = writeOffLeg(snap(s));
      const n = entries(s).length;
      if (n >= CASH_PICK_ENTRIES_MAX + 1 && (dueMinor > 0 ? dueMinor !== due : w !== undefined && (s.entry[w.id] ?? 0) === 0)) return null; // CASH_SETTLE_LIMIT
      if (dueMinor > 0) return add(s, { method: 'cash', amt: dueMinor, pick: line !== undefined, line }, dueMinor - due, op);
      if (!w) return null; // NOTHING_TO_ROUND_AGAINST
      return { ...s, entry: { ...s.entry, [w.id]: (s.entry[w.id] ?? 0) - due }, ops: [...s.ops, op] };
    }
    if (t === 0 || line !== undefined) return null; // the pane refuses a whole pick that does not settle
    if (t % inc !== 0) return null; // CASH_NOT_PAYABLE
    return add(s, { method: 'cash', amt: Math.min(t, due), pick: false }, 0, op);
  };
  /** use-sale.ts:943-957 and :1000-1001: a cash part pick of goods t < balance carries; one at the whole-settle due is promoted. */
  const partPick = (s: St, i: number, t: number): St | null => {
    const rem = remainderEntriesMinor(snap(s));
    const a = roundedPickTarget(t, rule, rem);
    if (a === 0) return null; // cash cannot pay it
    const B = bal(s);
    if (a === roundedRemainder(B, rem, rule)) {
      if (entries(s).length >= CASH_PICK_ENTRIES_MAX + 1 && a !== B) return null; // CASH_SETTLE_LIMIT
      return add(s, { method: 'cash', amt: a, pick: true, line: i }, a - B, `promo#${i}:${t}->${a}`);
    }
    if (a !== t && entries(s).length >= CASH_PICK_ENTRIES_MAX) return null; // CASH_PICK_LIMIT
    return add(s, { method: 'cash', amt: a, pick: true, line: i }, a - t, `pick#${i}:${t}->${a}`);
  };
  /** use-sale.ts:1023-1026: voidTender; a locked leg (from-store-order.ts) is refused. */
  const voidLeg = (s: St, idx: number): St | null => {
    const leg = s.legs[idx];
    if (!leg.live || leg.locked || cashVoidRefusal(snap(s), leg.id)) return null;
    return { ...s, legs: s.legs.map((l, j) => (j === idx ? { ...l, live: false } : l)), ops: [...s.ops, `void${idx}`] };
  };
  const cardAmounts = (b: number) => {
    const xs = new Set<number>([b]);
    for (let r = 1; r < 2 * inc; r++) { if (r < b) xs.add(r); if (b - r > 0) xs.add(b - r); }
    return [...xs];
  };
  type MoveOpts = { cards?: boolean; cardPicks?: boolean; motion?: boolean; picks?: boolean };
  const moves = (s: St, o: MoveOpts = {}): St[] => {
    const { cards = true, cardPicks = false, motion = true, picks = true } = o;
    const out: (St | null)[] = [];
    const b = bal(s);
    if (b > 0) {
      const h = held(s);
      const lines = goods.map((_, i) => i).filter((i) => !h.has(i));
      if (cards) for (const x of cardAmounts(b)) out.push(add(s, { method: 'card', amt: x, pick: false }, 0, `card${x}`));
      if (cardPicks) for (const i of lines) out.push(add(s, { method: 'card', amt: Math.min(goods[i], b), pick: true, line: i }, 0, `cardPick#${i}`));
      if (picks) for (const i of lines) {
        const t = Math.min(goods[i], b);
        out.push(t < b ? partPick(s, i, t) : cashSettle(s, roundedRemainder(b, remainderEntriesMinor(snap(s)), rule), i, `whole#${i}`));
      }
      const prefill = roundedRemainder(b, remainderEntriesMinor(snap(s)), rule);
      const ts = new Set([0, prefill]);
      for (let k = inc; k <= Math.min(b + inc, 4 * inc); k += inc) ts.add(k);
      const fl = Math.floor(b / inc) * inc;
      ts.add(fl); ts.add(fl + inc);
      for (const t of ts) out.push(cashSettle(s, t, undefined, `cash${t}`));
      if (motion) { // a card in motion: cash records unrounded, no entry, a whole number of steps (ADR-094 item 1)
        for (const a of new Set([inc, 2 * inc, Math.floor((b - 1) / inc) * inc])) if (a > 0 && a < b) out.push(add(s, { method: 'cash', amt: a, pick: false }, 0, `mcash${a}`));
        for (const c of new Set([b % inc || inc, (b % inc || inc) + inc])) {
          const a = b - c;
          if (a > 0 && a % inc === 0) out.push(add(add(s, { method: 'card', amt: c, pick: false }, 0, `mclose${c}`), { method: 'cash', amt: a, pick: false }, 0, `+cash${a}`));
        }
        for (const i of lines) { const t = Math.min(goods[i], b); if (t < b && t % inc === 0) out.push(add(s, { method: 'cash', amt: t, pick: true, line: i }, 0, `mpick#${i}`)); }
      }
    }
    s.legs.forEach((_, idx) => out.push(voidLeg(s, idx)));
    return out.filter((x): x is St => x !== null);
  };
  const key = (s: St) => s.legs.map((l) => `${l.method[1]}${l.amt}${l.pick ? 'p' : ''}${l.line ?? ''}${l.live ? '' : 'v'}:${s.entry[l.id] ?? 0}`).join('|');
  const init: St = { legs: [], entry: {}, n: 0, ops: [] };
  return { G, S, bal, closed, entries, moves, key, init, live, voidLeg, cashSettle, add };
}
type Model = ReturnType<typeof model>;

type Acc = { states: number; closed: number; max: number; min: number; maxEntries: number; depth: number; failures: string[] };
const newAcc = (): Acc => ({ states: 0, closed: 0, max: -Infinity, min: Infinity, maxEntries: 0, depth: 0, failures: [] });
const witness = (m: Model, goods: number[], s: St) => `goods=${JSON.stringify(goods)} :: ${s.ops.join(' ')} => S=${m.S(s)} entries=${JSON.stringify(m.entries(s).map((e) => e.minor))}`;
/** Per state: S in R; an open sale with live legs can still close in cash or void a cash leg (card legs taken as not voidable). */
function observe(acc: Acc, m: Model, rule: Rule, s: St, goods: number[]) {
  acc.states++;
  const S = m.S(s);
  acc.maxEntries = Math.max(acc.maxEntries, m.entries(s).length);
  acc.max = Math.max(acc.max, S); acc.min = Math.min(acc.min, S);
  if (!inR(rule, S) && acc.failures.length < 3) acc.failures.push(`S outside R: ${witness(m, goods, s)}`);
  if (m.closed(s)) { acc.closed++; return; }
  if (m.bal(s) > 0 && m.live(s).length > 0) {
    const ok = m.moves(s, { cards: false, motion: false }).some((t) => {
      const op = t.ops.at(-1)!;
      return op.startsWith('void') ? s.legs[Number(op.slice(4))].method === 'cash' : m.closed(t);
    });
    if (!ok && acc.failures.length < 3) acc.failures.push(`stranded: ${witness(m, goods, s)}`);
  }
}

function bfs(acc: Acc, goods: number[], rule: Rule, depth: number, cap: number, init?: St) {
  const m = model(goods, rule);
  const seen = new Set<string>();
  let front: St[] = [init ?? m.init];
  for (let d = 0; d < depth && front.length; d++) {
    const next: St[] = [];
    for (const s of front) for (const t of m.moves(s, { cardPicks: true })) {
      const k = m.key(t);
      if (seen.has(k)) continue;
      seen.add(k);
      observe(acc, m, rule, t, goods);
      next.push(t);
      if (seen.size >= cap) return;
    }
    acc.depth = Math.max(acc.depth, d + 1); // every state at this depth was reached
    front = next;
  }
}

/** Seeded walks (xorshift32, deterministic), biased to closing moves and to voids from closed states, to reach the 16-entry caps. */
function walks(acc: Acc, goods: number[], rule: Rule, count: number, seed: number) {
  const m = model(goods, rule);
  let x = seed >>> 0;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  for (let w = 0; w < count; w++) {
    let s = m.init;
    for (let step = 0; step < 70; step++) {
      const all = m.moves(s, { cardPicks: true });
      const voids = all.filter((t) => t.ops.at(-1)!.startsWith('void'));
      const rest = all.filter((t) => !t.ops.at(-1)!.startsWith('void'));
      const closers = rest.filter((t) => m.closed(t));
      const picks = rest.filter((t) => /^(pick|promo|whole)#/.test(t.ops.at(-1)!));
      const r = rnd();
      const pool = m.closed(s) ? voids : r < 0.1 && voids.length ? voids : r < 0.75 && picks.length ? picks : r < 0.85 && closers.length ? closers : rest.length ? rest : voids;
      if (!pool.length) break;
      s = pool[Math.floor(rnd() * pool.length)];
      observe(acc, m, rule, s, goods);
    }
  }
}

const RULES: [string, Rule][] = [
  ['nearest 5', { incrementMinor: 5, mode: 'nearest' }], ['up 5', { incrementMinor: 5, mode: 'up' }], ['down 5', { incrementMinor: 5, mode: 'down' }],
  ['nearest 10', { incrementMinor: 10, mode: 'nearest' }], ['up 10', { incrementMinor: 10, mode: 'up' }], ['down 10', { incrementMinor: 10, mode: 'down' }],
];

describe('ADR-094 carry rule: the search', () => {
  it.each(RULES)('%s: S stays in R in every reached state and no open sale is stranded', (_name, rule) => {
    const inc = rule.incrementMinor;
    const acc = newAcc();
    // Bounded exhaustive BFS over two goods sets.
    for (const goods of [[inc + 3, 3 * inc + 1], [2, 2 * inc + inc - 1]]) bfs(acc, goods, rule, 8, 100_000);
    const bfsStates = acc.states, bfsDepth = acc.depth;
    // Walks to the caps: many lines of rounding residues, so picks and settles keep adding entries.
    const goodsSets = [
      Array.from({ length: 6 }, (_, i) => inc * (i + 1) + ((i * 3 + 1) % inc)),
      [103 % (20 * inc) + 3, ...Array.from({ length: 8 }, (_, i) => 20 * inc + ((i * 7 + 2) % inc))],
      Array.from({ length: 18 }, (_, i) => (i % 3 === 0 ? 20 * inc : 2 * inc) + ((i * 3 + 1) % inc)),
    ];
    goodsSets.forEach((goods, gi) => walks(acc, goods, rule, 120, 12345 + gi * 7919));
    console.info(`search ${_name}: bfs states=${bfsStates} full depth=${bfsDepth} total states=${acc.states} closed=${acc.closed} S max=${acc.max} min=${acc.min} max entries=${acc.maxEntries}`);
    expect(acc.failures, acc.failures.join('\n')).toEqual([]);
    expect(acc.maxEntries).toBe(CASH_PICK_ENTRIES_MAX + 1); // the walks reach the 16-entry caps
  }, 90_000);
});

/** Replays a plan by op name; `whole#i@x` and `pick#i:…` tokens match the move for that line, whatever its amount. A refused token is skipped. */
function replay(goods: number[], rule: Rule, plan: string, init?: St) {
  const m = model(goods, rule);
  let s = init ?? m.init;
  const refused: string[] = [];
  for (const w0 of plan.split(' ')) {
    const w = w0.replace(/@\d+$/, '').replace(/:.*$/, '');
    const nx = m.moves(s, { cardPicks: true }).find((t) => { const op = t.ops.at(-1)!; return op === w || op.startsWith(`${w}:`) || (w.startsWith('pick#') && op.startsWith(`promo#${w.slice(5)}:`)); });
    if (!nx) { refused.push(w0); continue; }
    s = nx;
  }
  return { m, s, refused };
}
/** Closes an open sale at the cash prefill, as a cashier taps Take. */
const closeInCash = (m: Model, s: St) => (m.closed(s) ? s : m.moves(s, { cards: false, motion: false, picks: false }).find((t) => t.ops.at(-1)!.startsWith('cash') && m.closed(t))!);
const nearest5: Rule = { incrementMinor: 5, mode: 'nearest' };
const PUMP1 = 'card5 cash4100 void0 card1 cash0 void1 card4094 whole#1@10 void3 card4090 whole#2@10 void5 card4086 whole#3@10 void7 card4082 whole#4@10';
const PUMP2 = 'card9 card9 card9 card3 cash4075 void0 cash5 void3 card2 cash5 void1 card5 cash0 void7 void2 card8 whole#1@10 void6 whole#2@10 void9 card6 whole#3@10';

describe('ADR-094 carry rule: fixed rows', () => {
  it.each([
    ['pump1 (main: +20)', [103, 1000, 1000, 1000, 1000], nearest5, PUMP1, [-2, 1]],
    ['pump2 (main: +18)', [103, 1000, 1000, 1000, 1000], nearest5, PUMP2, [2, -4]],
    ['the reviewer\'s 52 plan (main: -6)', [12, 40], nearest5, 'pick#0:12->10 card1 card2 whole#1@35 void2 cash0', [-2, 1]],
    ['plan 103 (main: -4)', [103], nearest5, 'card5 cash100 void0 card1 cash0 void1 card98', [1]],
    ['the C2+D counterexample (down 5, goods 823)', [6, 102, 104, 101, 103, 100, 102, 104, 101], { incrementMinor: 5, mode: 'down' } as Rule,
      'card5 void0 cash10 card805 whole#1 void2 card1 cash805 void4 whole#6 void3 cardPick#6', []],
    ['the #1365 reproduction (six card 0.02, a cash pick of 0.40, void-and-tap-zero cycles)', [12, 40], nearest5,
      'card2 card2 card2 card2 card2 card2 whole#1 void0 cash0 void1 cash0 void2 cash0 void3 cash0 void4 cash0 void5 cash0', [-2]],
    ['a card write-off under a later cash entry (nearest 5, goods 0.24)', [24], nearest5, 'card1 card21 cash0 void0 cash5', [-2, 4]],
    ['a card write-off under a later cash entry (down 5, goods 0.24)', [24], { incrementMinor: 5, mode: 'down' } as Rule, 'card1 card19 cash0 void0 cash5', [-4, 4]],
  ] as [string, number[], Rule, string, number[]][])('%s closes with S in R', (_name, goods, rule, plan, final) => {
    const { m, s: end } = replay(goods, rule, plan);
    const s = closeInCash(m, end);
    expect(m.closed(s), witness(m, goods, s)).toBe(true);
    expect(inR(rule, m.S(s)), witness(m, goods, s)).toBe(true);
    expect(m.entries(s).map((e) => e.minor), witness(m, goods, s)).toEqual(final);
  });

  it('the card write-off cannot be voided from under the later cash entry', () => {
    const { m, s, refused } = replay([24], nearest5, 'card1 card21 cash0 void0 cash5');
    expect(refused).toEqual([]);
    expect(s.entry[s.legs[1].id]).toBe(-2);
    expect(m.voidLeg(s, 1), witness(m, [24], s)).toBeNull();
  });
});

describe('ADR-094 carry rule: stored and locked legs', () => {
  // pump1's end state on main, as stored and reopened by reopen.ts: counting legs only, every leg voidable, units dropped, entries kept (S = +20).
  const goods = [103, 1000, 1000, 1000, 1000];
  const stored: St = {
    legs: [['card', 1], ['cash', 10], ['cash', 10], ['cash', 10], ['card', 4082], ['cash', 10]].map(([method, amt], i) => ({ id: `R${i}`, method: method as Leg['method'], amt: amt as number, pick: false, live: true })),
    entry: { R0: -4, R1: 6, R2: 6, R3: 6, R5: 6 }, n: 6, ops: ['reopen'],
  };
  it('a stored out-of-range sale is read as it is: finished by card it keeps +20; a cash settle after a void brings it into R', () => {
    const m = model(goods, nearest5);
    expect(m.S(stored)).toBe(20);
    expect(m.closed(stored)).toBe(true);
    const byCard = replay(goods, nearest5, 'void4 card4082', stored);
    expect(byCard.refused).toEqual([]);
    expect(m.closed(byCard.s)).toBe(true);
    expect(m.S(byCard.s)).toBe(20);
    const byCash = replay(goods, nearest5, 'void4 cash4060', stored);
    expect(byCash.refused).toEqual([]);
    expect(m.closed(byCash.s), witness(m, goods, byCash.s)).toBe(true);
    expect(m.entries(byCash.s).map((e) => e.minor)).toEqual([-4, 6, 6, 6, 6, -22]);
    expect(inR(nearest5, m.S(byCash.s))).toBe(true);
  });

  it('a locked store-order leg carries no entry and is never voided; the sale still finishes and every till leg can be voided', () => {
    for (const [, rule] of RULES) {
      const g = [rule.incrementMinor * 3 + 2, rule.incrementMinor + 1];
      const m = model(g, rule);
      const init: St = { legs: [{ id: 'S0', method: 'card', amt: 4, pick: false, live: true, locked: true }], entry: {}, n: 1, ops: ['store-order'] };
      const acc = newAcc();
      const seen = new Set<string>();
      let front = [init];
      for (let d = 0; d < 5 && front.length; d++) {
        const next: St[] = [];
        for (const s of front) for (const t of m.moves(s, { cardPicks: true })) {
          const k = m.key(t);
          if (seen.has(k) || seen.size > 20_000) continue;
          seen.add(k);
          observe(acc, m, rule, t, g);
          next.push(t);
          expect(t.legs[0].live, witness(m, g, t)).toBe(true); // the locked leg is never voided
          expect(t.entry.S0 ?? 0, witness(m, g, t)).toBe(0); // the locked leg carries no entry
          // Every till leg can be voided, latest first.
          let u = t;
          for (let idx = u.legs.length - 1; idx > 0; idx--) if (u.legs[idx].live) u = m.voidLeg(u, idx) ?? u;
          expect(m.live(u).map((l) => l.id), witness(m, g, t)).toEqual(['S0']);
        }
        front = next;
      }
      expect(acc.failures, acc.failures.join('\n')).toEqual([]);
      expect(acc.closed).toBeGreaterThan(0);
    }
  }, 60_000);
});

describe('ADR-094 carry rule: R is the rounding range', () => {
  it('R(mode) holds roundToIncrement(u) - u for every u', () => {
    for (const [, rule] of RULES) for (let u = 1; u < 200; u++) expect(inR(rule, roundToIncrement(u, rule.incrementMinor, rule.mode) - u)).toBe(true);
  });
});
