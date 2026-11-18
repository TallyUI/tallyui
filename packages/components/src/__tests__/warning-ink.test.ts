import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// Words in warning colour use text-warning-text (v2's darker ink); bare text-warning is the
// fill colour for backgrounds and icons. text-warning-foreground does not match the regex.
const BARE = /\btext-warning(?![-\w])/;

describe('warning ink', () => {
  it('warning words use text-warning-text, never the bare fill colour', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = (readdirSync(src, { recursive: true }) as string[]).filter(
      (f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !f.split(sep).includes('__tests__'),
    );
    const offenders = files.filter((f) => BARE.test(readFileSync(join(src, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
