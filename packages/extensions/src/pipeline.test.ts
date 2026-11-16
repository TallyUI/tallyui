import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_BUDGET_MS, ACTION_HOOK_STRIKES, createExtensionHost, GUARD_FAILED } from './index';
import type { ActionContext, ActionHandler, ExtensionManifest, HookContribution, SaleSource } from './index';

const event = 'checkout.tender.start', payload = { method: 'cash' } as const;
type Hook = HookContribution<typeof event>;
function extension(id = 'acme.test', tier: Hook['tier'] = 'guard', handler: ActionHandler<typeof event> = () => undefined): ExtensionManifest {
  return { id, apiVersion: 1, capabilities: ['sale.read', 'register.read'], targets: {},
    hooks: { [event]: { tier, load: vi.fn(async () => ({ default: handler })) } } };
}
afterEach(() => vi.useRealTimers());

it.each([
  ['hook.unknown', 'cart.line.add', { 'cart.line.add': { tier: 'guard', load: async () => ({ default: () => undefined }) } }],
  ['hook.invalid', event, { [event]: { tier: 'other', load: async () => ({ default: () => undefined }) } }],
  ['hook.invalid', event, { [event]: { tier: 'guard', load: 'x' } }],
])('refuses %s (%s)', (reason, detail, hooks) => {
  const host = createExtensionHost({ extensions: [{ ...extension(), hooks } as ExtensionManifest], log: vi.fn() });
  expect(host.refused).toEqual([{ id: 'acme.test', reason, detail }]);
  expect(host.accepted).toEqual([]);
});

it('resolves null with no hooks', async () => {
  const host = createExtensionHost({ extensions: [{ ...extension(), hooks: undefined }], log: vi.fn() });
  await expect(host.dispatch(event, payload)).resolves.toBeNull();
});

it.each([undefined, 'Register closed'])('runs extensions before guards, ignores their refusal, and stops at a guard refusal: %s', async refusal => {
  const calls: string[] = [], later = vi.fn(() => { calls.push('later'); });
  const host = createExtensionHost({ log: vi.fn(), extensions: [
    extension('acme.guard', 'guard', () => { calls.push('guard'); return refusal ? { refuse: refusal } : undefined; }),
    extension('acme.later', 'guard', later),
    extension('acme.ext', 'extension', () => { calls.push('extension'); return { refuse: 'ignored' }; }),
  ] });
  await expect(host.dispatch(event, payload)).resolves.toBe(refusal ?? null);
  expect(calls).toEqual(refusal ? ['extension', 'guard'] : ['extension', 'guard', 'later']);
  expect(later).toHaveBeenCalledTimes(refusal ? 0 : 1);
});

describe.each(['guard', 'extension'] as const)('%s failures', tier => {
  it.each<[string, Hook['load']]>([
    ['throws', async () => ({ default: () => { throw new Error('handler failed'); } })],
    ['load rejects', async () => { throw new Error('load failed'); }],
    ['malformed verdict', async () => ({ default: () => ({ refuse: '' }) })],
  ])('%s', async (_name, load) => {
    const log = vi.fn(), manifest = { ...extension(), hooks: { [event]: { tier, load } } };
    const host = createExtensionHost({ extensions: [manifest], log });
    await expect(host.dispatch(event, payload)).resolves.toBe(tier === 'guard' ? GUARD_FAILED : null);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`acme.test ${event}:`));
  });
});

it('retries a rejected guard load on the next dispatch', async () => {
  const manifest = extension(), load = vi.fn<Hook['load']>()
    .mockRejectedValueOnce(new Error('load failed'))
    .mockResolvedValue({ default: () => undefined });
  manifest.hooks![event]!.load = load;
  const host = createExtensionHost({ extensions: [manifest], log: vi.fn() });
  await expect(host.dispatch(event, payload)).resolves.toBe(GUARD_FAILED);
  await expect(host.dispatch(event, payload)).resolves.toBeNull();
  expect(load).toHaveBeenCalledTimes(2);
});

it.each(['handler', 'load'] as const)('times out a guard whose %s never settles and clears its timer', async phase => {
  vi.useFakeTimers();
  const manifest = extension('acme.guard', 'guard', () => new Promise(() => {}));
  if (phase === 'load') manifest.hooks![event]!.load = () => new Promise(() => {});
  const host = createExtensionHost({ extensions: [manifest], log: vi.fn() }), settled = vi.fn();
  const result = host.dispatch(event, payload).then(answer => { settled(answer); return answer; });
  await vi.advanceTimersByTimeAsync(ACTION_BUDGET_MS[event] - 1);
  expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toBe(GUARD_FAILED);
  expect(vi.getTimerCount()).toBe(0);
});

it('shares the extension budget: the second 1000 ms hook times out and its later refusal is ignored', async () => {
  vi.useFakeTimers();
  const log = vi.fn(), handler = vi.fn(() => new Promise<{ refuse: string }>(resolve => setTimeout(() => resolve({ refuse: 'ignored' }), 1000)));
  const host = createExtensionHost({ log, extensions: [extension('acme.first', 'extension', handler), extension('acme.second', 'extension', handler)] });
  const result = host.dispatch(event, payload);
  await vi.advanceTimersByTimeAsync(ACTION_BUDGET_MS[event]);
  await expect(result).resolves.toBeNull();
  expect(handler).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith(expect.stringContaining(`acme.second ${event}: Error: timeout`));
  await vi.advanceTimersByTimeAsync(500);
  expect(log).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['extension', 'guard'] as const)('switches off a %s hook after three failures, preserving guard refusal', async tier => {
  const handler = vi.fn(() => { throw new Error('failed'); }), manifest = extension('acme.test', tier, handler), log = vi.fn();
  const host = createExtensionHost({ extensions: [manifest], log });
  for (let i = 0; i < ACTION_HOOK_STRIKES + 1; i++) {
    await expect(host.dispatch(event, payload)).resolves.toBe(tier === 'guard' ? GUARD_FAILED : null);
    expect(handler).toHaveBeenCalledTimes(Math.min(i + 1, ACTION_HOOK_STRIKES));
  }
  expect(manifest.hooks![event]!.load).toHaveBeenCalledTimes(1);
  expect(log.mock.calls.filter(([message]) => message.includes('switched off'))).toHaveLength(1);
});

it('gates source views by grants and freezes the context and copied payload', async () => {
  const sale: SaleSource = { view: { value: { stage: 'cart', currency: 'EUR', coupons: [], couponPricesStale: false, couponsRepricing: false }, subscribe: () => () => {} },
    actions: { applyCoupon: async () => null, removeCoupon: () => null, repriceCoupons: async () => null } };
  const register = { value: { open: true }, subscribe: () => () => {} }, contexts: ActionContext<typeof event>[] = [];
  const handler: ActionHandler<typeof event> = ctx => { contexts.push(ctx); };
  const host = createExtensionHost({ log: vi.fn(), grant: { 'acme.granted': ['sale.read', 'register.read'] },
    extensions: [extension('acme.granted', 'guard', handler), extension('acme.ungranted', 'guard', handler)] });
  await expect(host.dispatch(event, payload, { sale, register })).resolves.toBeNull();
  expect(contexts[0].view.sale).toBe(sale.view); expect(contexts[0].view.register).toBe(register);
  expect(contexts[1].view).toEqual({});
  for (const ctx of contexts) {
    expect(ctx.event).toBe(event); expect(ctx.payload).toEqual(payload); expect(ctx.payload).not.toBe(payload);
    expect(Object.isFrozen(ctx)).toBe(true); expect(Object.isFrozen(ctx.payload)).toBe(true);
  }
});
