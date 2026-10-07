import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docsPageMetadata, docsPageTitle } from './docs-metadata';

describe('docsPageTitle', () => {
  it('labels pages within the primitives and ui sections', () => {
    expect(docsPageTitle('Accordion', ['primitives', 'accordion'])).toBe('Accordion (primitive)');
    expect(docsPageTitle('Accordion', ['ui', 'accordion'])).toBe('Accordion (styled)');
    expect(docsPageTitle('Primitives', ['primitives'])).toBe('Primitives');
    expect(docsPageTitle('CartBar', ['components', 'cart-bar'])).toBe('CartBar');
  });
});

describe('docsPageMetadata', () => {
  it('sets the section title, canonical, and og:url', () => {
    expect(docsPageMetadata({
      title: 'Accordion',
      description: 'd',
      url: '/docs/ui/accordion',
      slugs: ['ui', 'accordion'],
      imageUrl: '/og/docs/ui/accordion/image.png',
    })).toEqual({
      title: 'Accordion (styled)',
      description: 'd',
      alternates: { canonical: '/docs/ui/accordion' },
      openGraph: { url: '/docs/ui/accordion', images: '/og/docs/ui/accordion/image.png' },
    });
  });

  it('keeps the root page title and URL', () => {
    const metadata = docsPageMetadata({
      title: 'Getting Started',
      url: '/docs',
      slugs: [],
      imageUrl: '/og/docs/image.png',
    });
    expect(metadata.title).toBe('Getting Started');
    expect(metadata.alternates?.canonical).toBe('/docs');
    expect(metadata.openGraph?.url).toBe('/docs');
  });
});

describe('docs content titles', () => {
  it('gives every docs page a unique title', () => {
    const docsDir = path.join(process.cwd(), 'apps/web/content/docs');
    const files = readdirSync(docsDir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.mdx'));
    const titles = files.map((file) => {
      const content = readFileSync(path.join(docsDir, file), 'utf8');
      const title = content.match(/^title:\s*(.+)$/m)![1].replace(/^(['"])(.*)\1$/, '$2');
      const slugs = file.slice(0, -4).split(path.sep);
      if (slugs[slugs.length - 1] === 'index') slugs.pop();
      return docsPageTitle(title, slugs);
    });
    const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index);
    expect(files.length).toBeGreaterThanOrEqual(100);
    expect(new Set(titles).size, `Duplicate docs titles: ${duplicates.join(', ')}`).toBe(files.length);
  });
});
