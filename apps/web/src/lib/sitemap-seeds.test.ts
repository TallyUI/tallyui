import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sitemapSeeds } from '../../scripts/sitemap-seeds.mjs';

const fixture = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://tallyui.com/</loc></url>
<url><loc>https://tallyui.com/docs/architecture</loc></url>
<url><loc>https://tallyui.com/docs/ui/accordion</loc></url>
</urlset>`;

describe('sitemapSeeds', () => {
  it('maps every sitemap loc onto the local server after the / seed', () => {
    const seeds = sitemapSeeds(fixture);

    expect(seeds).toEqual([
      { source: '/', url: 'http://localhost:3000/' },
      { source: 'sitemap', url: 'http://localhost:3000/' },
      { source: 'sitemap', url: 'http://localhost:3000/docs/architecture' },
      { source: 'sitemap', url: 'http://localhost:3000/docs/ui/accordion' },
    ]);
    expect(seeds.every(({ url }) => !url.includes('tallyui.com'))).toBe(true);
  });

  it('rejects an empty sitemap or input without a urlset', () => {
    expect(() => sitemapSeeds('<urlset></urlset>')).toThrow(/sitemap/);
    expect(() => sitemapSeeds('<html></html>')).toThrow(/sitemap/);
  });

  it('CLI fails on an empty sitemap and prints the seed list for a real one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sitemap-seeds-'));
    const script = resolve(import.meta.dirname, '../../scripts/sitemap-seeds.mjs');
    try {
      const emptyFile = join(dir, 'empty.xml');
      const file = join(dir, 'sitemap.xml');
      writeFileSync(emptyFile, '<urlset></urlset>');
      writeFileSync(file, fixture);

      const empty = spawnSync(process.execPath, [script, emptyFile], { encoding: 'utf8' });
      expect(empty.status).not.toBe(0);
      const result = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout.trim().split('\n')).toHaveLength(4);
      expect(result.stderr).toContain('seed (/): http://localhost:3000/');
      expect(result.stderr).toContain('seed (sitemap): http://localhost:3000/docs/ui/accordion');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
