import { expect, it, vi } from 'vitest';
import { createExtensionHost, defineExtension, EXTENSION_API_VERSION } from './index';
import type { CreateExtensionHostOptions, ExtensionManifest, RefusalReason } from './index';

const target = 'pos.cart.after-subtotal';
function manifest(overrides: Partial<ExtensionManifest> = {}): ExtensionManifest {
  return { id: 'acme.test', apiVersion: 1, capabilities: ['sale.read'],
    targets: { [target]: { load: vi.fn(async () => ({ default: () => null })) } }, ...overrides };
}

it('accepts valid manifests, orders entries, and keeps frozen arrays stable', () => {
  const load = vi.fn(async () => ({ default: () => null }));
  const extensions = [manifest({ id: 'b.x', targets: { [target]: { order: 50, load } } }),
    manifest({ id: 'a.x', targets: { [target]: { order: 50, load } } }), manifest({ id: 'a.a' })];
  expect(defineExtension(extensions[0])).toBe(extensions[0]);
  const host = createExtensionHost({ extensions });
  expect(host.accepted).toEqual(['b.x', 'a.x', 'a.a']);
  expect(host.refused).toEqual([]);
  expect(host.entries(target).map(entry => [entry.extensionId, entry.order])).toEqual([['a.x', 50], ['b.x', 50], ['a.a', 100]]);
  expect(host.entries(target)).toBe(host.entries(target));
  expect(Object.isFrozen(host.entries(target))).toBe(true);
  expect(load).not.toHaveBeenCalled();
});

it.each<{ reason: RefusalReason; detail: string; overrides: Record<string, unknown>; grant?: CreateExtensionHostOptions['grant'] }>([
  { reason: 'id.invalid', detail: 'NoDots', overrides: { id: 'NoDots' } },
  { reason: 'id.invalid', detail: 'acme', overrides: { id: 'acme' } },
  { reason: 'id.duplicate', detail: 'acme.test', overrides: {} },
  { reason: 'apiVersion.unsupported', detail: '2', overrides: { apiVersion: 2 } },
  { reason: 'capability.unknown', detail: 'printer.print', overrides: { capabilities: ['printer.print'] } },
  { reason: 'target.unknown', detail: 'pos.nowhere', overrides: { targets: { 'pos.nowhere': {} } } },
  { reason: 'target.invalid', detail: target, overrides: { targets: { [target]: { order: 1.5, load: async () => ({ default: () => null }) } } } },
  { reason: 'target.invalid', detail: target, overrides: { targets: { [target]: {} } } },
  { reason: 'capability.notDeclared', detail: 'sale.coupons', overrides: {}, grant: { 'acme.test': ['sale.coupons'] } },
])('refuses $reason ($detail)', ({ reason, detail, overrides, grant }) => {
  const log = vi.fn(), rejected = manifest(overrides as Partial<ExtensionManifest>);
  const first = reason === 'id.duplicate' ? [manifest()] : [];
  const host = createExtensionHost({ extensions: [...first, rejected], grant, log });
  expect(host.refused).toEqual([{ id: rejected.id, reason, detail }]);
  expect(host.accepted).toEqual(first.map(extension => extension.id));
  expect(host.entries(target)).toHaveLength(first.length);
  expect(log).toHaveBeenCalledWith(`[@tallyui/extensions] refused ${rejected.id}: ${reason} (${detail})`);
  expect(log.mock.calls.filter(([message]) => message.includes('refused'))).toHaveLength(1);
});

it('logs a grant for an unknown id', () => {
  const log = vi.fn();
  createExtensionHost({ extensions: [], grant: { 'missing.id': ['sale.read'] }, log });
  expect(log).toHaveBeenCalledExactlyOnceWith('[@tallyui/extensions] grant names no loaded extension: missing.id');
});

it('grants no capabilities by default', () => {
  expect(createExtensionHost({ extensions: [manifest()] }).entries(target)[0].capabilities.size).toBe(0);
});

it('keeps hosts independent and returns a stable frozen empty array', () => {
  const extension = manifest(), first = createExtensionHost({ extensions: [extension] });
  const second = createExtensionHost({ extensions: [extension] }), empty = createExtensionHost({ extensions: [] });
  expect(first.entries(target)).not.toBe(second.entries(target));
  expect(first.entries(target)[0].Block).not.toBe(second.entries(target)[0].Block);
  expect(first.entries(target)[0].capabilities).not.toBe(second.entries(target)[0].capabilities);
  expect(empty.entries(target)).toBe(empty.entries(target));
  expect(empty.entries(target)).toEqual([]);
  expect(Object.isFrozen(empty.entries(target))).toBe(true);
});

it('exports extension API version 1', () => { expect(EXTENSION_API_VERSION).toBe(1); });
