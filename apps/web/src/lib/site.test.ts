// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import databasePackage from '../../../../packages/database/package.json';
import { rxdbVersion } from './site';

describe('home install RxDB version', () => {
  it('does not hard-code the RxDB version in the home page', () => {
    const page = readFileSync(new URL('../app/(home)/page.tsx', import.meta.url), 'utf8');
    expect(page).not.toMatch(/rxdb@\d/);
    expect(page).not.toMatch(/exactly \d/);
  });

  it('uses the exact RxDB pin from the database package', () => {
    expect(rxdbVersion).toBe(databasePackage.dependencies.rxdb);
    expect(rxdbVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
