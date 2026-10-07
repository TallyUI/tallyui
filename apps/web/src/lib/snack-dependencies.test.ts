// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { snackDependencies, propsSnackDependencies } from '../components/snacks/snack-wrapper';

const rxdbPackage = createRequire(
  new URL('../../../../packages/components/package.json', import.meta.url),
)('rxdb/package.json');

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

  it('pins the rxdb whose peers are checked', () => {
    expect(dependencies.get('rxdb')).toBe(rxdbPackage.version);
  });

  it("satisfies rxdb's vue peer", () => {
    // Any version satisfies '*'; if rxdb narrows the range, re-pick the vue pin inside it.
    expect(rxdbPackage.peerDependencies.vue).toBe('*');
    expect(dependencies.get('vue')).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
