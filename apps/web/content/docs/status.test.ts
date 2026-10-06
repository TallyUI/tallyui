// Guards the status table's cell format and the evidence repo for each app column.
// Also keeps the rows the apps' READMEs list as not yet from claiming they work.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const status = readFileSync(path.join(repoRoot, 'apps/web/content/docs/status.mdx'), 'utf8');
const connectors = readFileSync(path.join(repoRoot, 'apps/web/content/docs/connectors.mdx'), 'utf8');
const home = readFileSync(path.join(repoRoot, 'apps/web/src/app/(home)/page.tsx'), 'utf8');
const table = status.split('\n')
  .filter((line) => line.startsWith('|'))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
const header = table[0];
const rows = table.slice(2);

describe('docs/status', () => {
  it('has a Feature | WooCommerce | Medusa | Vendure table with at least 20 rows', () => {
    expect(header).toEqual(['Feature', 'WooCommerce', 'Medusa', 'Vendure']);
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const row of rows) {
      expect(row, row[0]).toHaveLength(4);
    }
    expect(new Set(rows.map((row) => row[0])).size).toBe(rows.length);
  });

  it('every app cell is "not yet" or a works link to that app\'s merged PR or a test file pinned to a commit', () => {
    const repos = ['wcpos/tallyui-woocommerce', 'medusapos/app', 'vendurepos/app'];
    for (const row of rows) {
      for (const [index, repo] of repos.entries()) {
        const cell = row[index + 1];
        const message = `${row[0]} | ${header[index + 1]}`;
        if (cell === 'not yet') continue;
        expect(cell, message).toMatch(/^\[works\]\((https:\/\/github\.com\/[^)]+)\)$/);
        const link = cell.match(/^\[works\]\((https:\/\/github\.com\/[^)]+)\)$/);
        expect(link?.[1], message).toMatch(new RegExp(
          `^https://github\\.com/${repo}/(pull/\\d+|blob/[0-9a-f]{40}/\\S+\\.(test|spec)\\.tsx?)$`,
        ));
      }
    }
  });

  it('keeps "not yet" where an app\'s README says the feature is not there', () => {
    // Each pair comes from that app's README "Not yet" / "Known limitations" list or from no code existing.
    const notYet = [
      ['Split one sale across several payments', 'WooCommerce'],
      ['Taxes', 'WooCommerce'],
      ['Recent orders on this till', 'WooCommerce'],
      ['Fee, shipping or custom lines', 'WooCommerce'],
      ['Coupons and promotion codes', 'WooCommerce'],
      ['Refunds and returns', 'WooCommerce'],
      ['Native iOS, Android or desktop app', 'WooCommerce'],
      ['Refunds and returns', 'Medusa'],
      ['Native iOS, Android or desktop app', 'Medusa'],
      ['Coupons and promotion codes', 'Medusa'],
      ['Fee, shipping or custom lines', 'Medusa'],
      ['Refunds and returns', 'Vendure'],
      ['Native iOS, Android or desktop app', 'Vendure'],
      ['Coupons and promotion codes', 'Vendure'],
      ['Fee, shipping or custom lines', 'Vendure'],
    ] as const;
    for (const [feature, column] of notYet) {
      const row = rows.find((entry) => entry[0] === feature);
      expect(row, `Missing feature: ${feature}`).toBeDefined();
      expect(row?.[header.indexOf(column)], `${feature} | ${column}`).toBe('not yet');
    }
  });

  it('is linked from the home page and the connectors page', () => {
    expect(home).toContain('href="/docs/status"');
    expect(connectors).toContain('](/docs/status)');
  });
});
