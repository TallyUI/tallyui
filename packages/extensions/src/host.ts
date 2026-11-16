import { lazy } from 'react';
import { EXTENSION_API_VERSION } from './index';
import { CAPABILITIES, TARGET_IDS } from './types';
import type { CreateExtensionHostOptions, ExtensionHost, ExtensionManifest, ExtensionRefusal, RefusalReason, TargetEntry, TargetId } from './types';

export function defineExtension<M extends ExtensionManifest>(manifest: M): M { return manifest; }
export function createExtensionHost({ extensions, grant = {}, log = console.warn }: CreateExtensionHostOptions): ExtensionHost {
  const accepted: string[] = [], refused: ExtensionRefusal[] = [];
  const entries: Record<TargetId, TargetEntry<TargetId>[]> = { 'pos.cart.after-subtotal': [] };
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
    const grants = grant[id] ?? [], undeclared = grants.findIndex(cap => !capabilities.includes(cap));
    if (undeclared !== -1) { refuse('capability.notDeclared', grants[undeclared]); continue; }
    accepted.push(id);
    for (const target of TARGET_IDS) {
      const contribution = targets[target];
      if (!contribution) continue;
      const entry = { extensionId: id, order: contribution.order ?? 100, capabilities: new Set(grants), Block: lazy(contribution.load), log };
      entries[target].push(entry);
    }
  }
  for (const key of Object.keys(grant)) if (!accepted.includes(key)) log(`[@tallyui/extensions] grant names no loaded extension: ${key}`);
  for (const target of TARGET_IDS) Object.freeze(entries[target].sort((a, b) => a.order - b.order || (a.extensionId < b.extensionId ? -1 : a.extensionId > b.extensionId ? 1 : 0)));
  return { accepted, refused, entries: target => entries[target] };
}
