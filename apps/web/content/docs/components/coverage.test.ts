// Guards sale and register component exports against missing docs pages and sidebar entries.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const docsDir = path.join(repoRoot, 'apps/web/content/docs/components');
const { pages } = JSON.parse(readFileSync(path.join(docsDir, 'meta.json'), 'utf8'));
const names = ['sale', 'register'].flatMap((group) => {
  const source = readFileSync(path.join(repoRoot, `packages/components/src/${group}/index.ts`), 'utf8');
  return [...source.matchAll(/export\s*\{([^}]+)\}\s*from\s/g)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim())
      .filter((name) => !name.startsWith('type ') && /^[A-Z][a-z][A-Za-z0-9]*$/.test(name)),
  );
});

describe('sale and register component docs coverage', () => {
  it('finds at least 20 component exports', () => {
    expect(names.length, 'Parsed sale and register component exports').toBeGreaterThanOrEqual(20);
  });

  for (const name of names) {
    const slug = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    it(`documents ${name} at ${slug}`, () => {
      const file = path.join(docsDir, `${slug}.mdx`);
      const message = `${name} (${slug})`;
      expect(existsSync(file), `${message}: missing docs page`).toBe(true);
      const content = readFileSync(file, 'utf8');
      const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      expect(frontmatter, `${message}: frontmatter title`).toMatch(new RegExp(`^title: ${name}\\r?$`, 'm'));
      expect(pages, `${message}: missing sidebar entry`).toContain(slug);
    });
  }
});
