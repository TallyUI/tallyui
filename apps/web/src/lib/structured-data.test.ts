import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd, homeJsonLd, jsonLdScript } from './structured-data';

describe('homeJsonLd', () => {
  it('serializes the organization and MIT source code schema without pricing', () => {
    const data = homeJsonLd('https://tallyui.com');
    const serialized = jsonLdScript(data);
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual(data);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(data['@graph'].map((node) => node['@type'])).toEqual([
      'Organization', 'SoftwareSourceCode',
    ]);

    const [organization, software] = data['@graph'];
    for (const value of [organization.name, organization.url, organization.logo]) {
      expect(value).toEqual(expect.any(String));
      expect(value).not.toBe('');
    }
    expect(organization.sameAs).toEqual(expect.any(Array));
    expect(organization.sameAs!.length).toBeGreaterThan(0);
    for (const value of [software.name, software.url, software.codeRepository]) {
      expect(value).toEqual(expect.any(String));
      expect(value).not.toBe('');
    }
    expect(software.programmingLanguage).toBe('TypeScript');
    expect(software.license).toBe('https://opensource.org/licenses/MIT');
    expect(serialized).not.toContain('"offers"');
    expect(serialized).not.toContain('"price"');

    JSON.parse(serialized, (_key, value) => {
      if (typeof value === 'string' && value.startsWith('http')) {
        expect(value.startsWith('https://')).toBe(true);
      }
      return value;
    });
  });
});

describe('breadcrumbJsonLd', () => {
  it('builds named ListItems with sequential positions and absolute URLs', () => {
    const data = breadcrumbJsonLd('https://tallyui.com', [
      { name: 'Tally UI', path: '/' },
      { name: 'Docs', path: '/docs' },
      { name: 'Components', path: '/docs/components' },
    ]);

    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement).toHaveLength(3);
    expect(data.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(data.itemListElement.map((item) => item.item)).toEqual([
      'https://tallyui.com/',
      'https://tallyui.com/docs',
      'https://tallyui.com/docs/components',
    ]);
    for (const item of data.itemListElement) {
      expect(item['@type']).toBe('ListItem');
      expect(item.name).toEqual(expect.any(String));
      expect(item.name).not.toBe('');
    }
  });
});

describe('jsonLdScript', () => {
  it('escapes script closing tags', () => {
    expect(jsonLdScript({ a: '</script>' })).not.toContain('</script>');
  });
});
