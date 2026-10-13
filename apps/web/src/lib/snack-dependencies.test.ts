// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { snackDependencies, propsSnackDependencies } from '../components/snacks/snack-wrapper';

const rxdbPackage = createRequire(
  new URL('../../../../packages/components/package.json', import.meta.url),
)('rxdb/package.json');

// From npm view rxdb@<version> peerDependencies; Snack ignores peerDependenciesMeta.optional,
// so optional peers count.
const recordedRxdbPeers: Record<string, Record<string, string>> = {
  '16.21.1': { rxjs: '^7.8.0' },
};

function rxdbPeersFor(version: string): Record<string, string> | undefined {
  return recordedRxdbPeers[version]
    ?? (version === rxdbPackage.version ? rxdbPackage.peerDependencies : undefined);
}

function satisfies(version: string, range: string): boolean {
  if (range !== '*' && !/^\^[1-9]\d*\.\d+\.\d+$/.test(range)) {
    throw new Error(`Unsupported range: ${range}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  if (range === '*') return true;
  const [major, minor, patch] = version.split('.').map(Number);
  const [requiredMajor, requiredMinor, requiredPatch] = range.slice(1).split('.').map(Number);
  return major === requiredMajor
    && (minor > requiredMinor || (minor === requiredMinor && patch >= requiredPatch));
}

function parseDependencies(list: string): Map<string, string | undefined> {
  const dependencies = new Map<string, string | undefined>();
  for (const entry of list.split(',')) {
    const separator = entry.lastIndexOf('@');
    if (separator > 0) {
      dependencies.set(entry.slice(0, separator), entry.slice(separator + 1));
    } else {
      dependencies.set(entry, undefined);
    }
  }
  return dependencies;
}

describe.each([
  ['snackDependencies', snackDependencies],
  ['propsSnackDependencies', propsSnackDependencies],
])('%s', (_name, list) => {
  const dependencies = parseDependencies(list);

  it('lists an rxdb whose peers are known', () => {
    const rxdbVersion = dependencies.get('rxdb');
    expect(rxdbVersion).toBeTypeOf('string');
    expect(rxdbPeersFor(rxdbVersion!)).toBeDefined();
  });

  it('lists every peer of that rxdb within its range', () => {
    const rxdbVersion = dependencies.get('rxdb')!;
    for (const [peer, range] of Object.entries(rxdbPeersFor(rxdbVersion)!)) {
      expect(dependencies.has(peer), peer).toBe(true);
      expect(satisfies(dependencies.get(peer)!, range)).toBe(true);
    }
  });
});
