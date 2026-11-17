// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { snackDependencies, propsSnackDependencies } from '../components/snacks/snack-wrapper';

const componentsPackage = createRequire(
  new URL('../../../../packages/components/package.json', import.meta.url),
)('./package.json');

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

  it('lists no rxdb, which Snack cannot resolve', () => {
    expect(dependencies.has('rxdb')).toBe(false);
  });

  it('lists rxjs at the version the components build against', () => {
    expect(dependencies.get('rxjs')).toBe(componentsPackage.devDependencies.rxjs);
  });
});
