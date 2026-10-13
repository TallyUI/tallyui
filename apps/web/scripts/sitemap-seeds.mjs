// Marketing backlog item 92: rewrite sitemap locs onto localhost so CI never checks the live site.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_SITEMAP = '.next/server/app/sitemap.xml.body';
export const DEFAULT_ORIGIN = 'http://localhost:3000';

export function sitemapSeeds(xml, origin = DEFAULT_ORIGIN) {
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)];
  if (!/<urlset(?:\s|>)/.test(xml) || locs.length === 0) {
    throw new Error('Empty or unparsable sitemap');
  }

  return [
    { source: '/', url: new URL('/', origin).href },
    ...locs.map(([, text]) => {
      const loc = new URL(text.trim());
      return { source: 'sitemap', url: new URL(loc.pathname + loc.search, origin).href };
    }),
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const xml = readFileSync(process.argv[2] ?? DEFAULT_SITEMAP, 'utf8');
  const seeds = sitemapSeeds(xml, process.argv[3] ?? DEFAULT_ORIGIN);
  for (const seed of seeds) {
    console.error(`seed (${seed.source}): ${seed.url}`);
  }
  console.error(`${seeds.length} link-check seeds`);
  console.log(seeds.map(({ url }) => url).join('\n'));
}
