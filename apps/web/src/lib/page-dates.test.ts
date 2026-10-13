import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageLastModified } from './page-dates';

describe('pageLastModified', () => {
  it('gives a docs page its source file\'s last commit date', () => {
    const file = 'apps/web/content/docs/architecture.mdx';
    const date = execFileSync('git', ['log', '-1', '--format=%cI', '--', `:(top)${file}`], {
      encoding: 'utf8',
    }).trim();

    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pageLastModified(file)).toBe(date);
  });

  it('dates the home page and every docs page, not all on one date', () => {
    const files = [
      'apps/web/src/app/(home)/page.tsx',
      ...readdirSync(resolve(import.meta.dirname, '../../content/docs'), { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith('.mdx'))
        .map((name) => `apps/web/content/docs/${name}`),
    ];
    const result = files.map(pageLastModified);

    expect(result).not.toContain(undefined);
    expect(new Set(result).size).toBeGreaterThan(1);
  });
});
