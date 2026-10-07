// Guards keeping the search dialog out of every page's load (backlog item 76).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root provider', () => {
  it('disables search dialog preloading', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../app/layout.tsx'), 'utf8');

    expect(source).toContain('<RootProvider search={{ preload: false }}>');
  });
});
