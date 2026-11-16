import { lazy } from 'react';
import { EXTENSION_API_VERSION } from './index';
import { ACTION_EVENTS, ACTION_BUDGET_MS, ACTION_HOOK_STRIKES, GUARD_FAILED, CAPABILITIES, TARGET_IDS } from './types';
import type { ActionEvent, ActionHandler, Capability, HookContribution } from './types';
import type { CreateExtensionHostOptions, ExtensionHost, ExtensionManifest, ExtensionRefusal, RefusalReason, TargetEntry, TargetId } from './types';

export function defineExtension<M extends ExtensionManifest>(manifest: M): M { return manifest; }
export function createExtensionHost({ extensions, grant = {}, log = console.warn }: CreateExtensionHostOptions): ExtensionHost {
  const accepted: string[] = [], refused: ExtensionRefusal[] = [];
  const entries: Record<TargetId, TargetEntry<TargetId>[]> = { 'pos.cart.after-subtotal': [] };
  const hooks: { event: ActionEvent; id: string; capabilities: ReadonlySet<Capability>; contribution: HookContribution<ActionEvent>;
    strikes: number; module?: Promise<{ default: ActionHandler<ActionEvent> }> }[] = [];
  for (const manifest of extensions) {
    const { id, apiVersion, capabilities, targets } = manifest;
    const refuse = (reason: RefusalReason, detail: string) => {
      refused.push({ id, reason, detail });
      log(`[@tallyui/extensions] refused ${id}: ${reason} (${detail})`);
    };
    if (typeof id !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(id)) { refuse('id.invalid', String(id)); continue; }
    if (accepted.includes(id)) { refuse('id.duplicate', id); continue; }
    if (apiVersion !== EXTENSION_API_VERSION) { refuse('apiVersion.unsupported', String(apiVersion)); continue; }
    const unknownCap = capabilities.findIndex(cap => !CAPABILITIES.includes(cap));
    if (unknownCap !== -1) { refuse('capability.unknown', capabilities[unknownCap]); continue; }
    const unknownTarget = Object.keys(targets).find(target => !TARGET_IDS.includes(target as TargetId));
    if (unknownTarget !== undefined) { refuse('target.unknown', unknownTarget); continue; }
    const invalidTarget = TARGET_IDS.find(target => Object.hasOwn(targets, target) &&
      (typeof targets[target]?.load !== 'function' || (targets[target]?.order !== undefined && !Number.isInteger(targets[target]?.order))));
    if (invalidTarget !== undefined) { refuse('target.invalid', invalidTarget); continue; }
    const unknownHook = Object.keys(manifest.hooks ?? {}).find(event => !ACTION_EVENTS.includes(event as ActionEvent));
    if (unknownHook !== undefined) { refuse('hook.unknown', unknownHook); continue; }
    const invalidHook = ACTION_EVENTS.find(event => Object.hasOwn(manifest.hooks ?? {}, event) &&
      (!['guard', 'extension'].includes(manifest.hooks?.[event]?.tier ?? '') || typeof manifest.hooks?.[event]?.load !== 'function'));
    if (invalidHook !== undefined) { refuse('hook.invalid', invalidHook); continue; }
    const grants = grant[id] ?? [], undeclared = grants.findIndex(cap => !capabilities.includes(cap));
    if (undeclared !== -1) { refuse('capability.notDeclared', grants[undeclared]); continue; }
    accepted.push(id);
    for (const event of ACTION_EVENTS) {
      const contribution = manifest.hooks?.[event];
      if (contribution) hooks.push({ event, id, capabilities: new Set(grants), contribution, strikes: 0 });
    }
    for (const target of TARGET_IDS) {
      const contribution = targets[target];
      if (!contribution) continue;
      const entry = { extensionId: id, order: contribution.order ?? 100, capabilities: new Set(grants), Block: lazy(contribution.load), log };
      entries[target].push(entry);
    }
  }
  for (const key of Object.keys(grant)) if (!accepted.includes(key)) log(`[@tallyui/extensions] grant names no loaded extension: ${key}`);
  for (const target of TARGET_IDS) Object.freeze(entries[target].sort((a, b) => a.order - b.order || (a.extensionId < b.extensionId ? -1 : a.extensionId > b.extensionId ? 1 : 0)));
  return { accepted, refused, entries: target => entries[target], async dispatch(event, payload, sources = {}) {
    for (const tier of ['extension', 'guard'] as const) {
      let deadline: number | undefined;
      for (const hook of hooks) {
        if (hook.event !== event || hook.contribution.tier !== tier) continue;
        if (hook.strikes >= ACTION_HOOK_STRIKES) {
          if (tier === 'guard') return GUARD_FAILED;
          continue;
        }
        const expires = deadline ??= Date.now() + ACTION_BUDGET_MS[event];
        const remaining = expires - Date.now();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          if (remaining <= 0) throw new Error('timeout');
          const ctx = Object.freeze({ event, payload: Object.freeze({ ...payload }), view: Object.freeze({
            ...(hook.capabilities.has('sale.read') && sources.sale ? { sale: sources.sale.view } : {}),
            ...(hook.capabilities.has('register.read') && sources.register ? { register: sources.register } : {}),
          }) });
          const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), remaining); });
          hook.module ??= Promise.resolve().then(() => hook.contribution.load());
          const verdict = await Promise.race([timeout, hook.module.then(module => {
            if (Date.now() >= expires) throw new Error('timeout');
            return module.default(ctx);
          })]);
          if (Date.now() >= expires) throw new Error('timeout');
          if (verdict !== undefined) {
            if (verdict === null || typeof verdict !== 'object' || typeof verdict.refuse !== 'string' || verdict.refuse.length === 0) throw new Error('malformed verdict');
            if (tier === 'guard') return verdict.refuse;
            try { log(`[@tallyui/extensions] ${hook.id} ${event}: extension refusal ignored (${verdict.refuse})`); } catch { /* Logging cannot stop dispatch. */ }
          }
        } catch (cause) {
          hook.strikes++;
          try {
            log(`[@tallyui/extensions] ${hook.id} ${event}: ${String(cause)}`);
            if (hook.strikes === ACTION_HOOK_STRIKES) log(`[@tallyui/extensions] ${hook.id} ${event}: switched off`);
          } catch { /* Logging cannot stop dispatch. */ }
          if (tier === 'guard') return GUARD_FAILED;
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      }
    }
    return null;
  } };
}
