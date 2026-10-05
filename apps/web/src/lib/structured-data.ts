export type Crumb = { name: string; path: string };

export function homeJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'Tally UI',
        url: `${siteUrl}/`, logo: `${siteUrl}/icon.svg`, sameAs: ['https://github.com/TallyUI'],
      },
      {
        '@type': 'SoftwareSourceCode', '@id': `${siteUrl}/#software`, name: 'Tally UI',
        description: 'Open-source building blocks for point-of-sale apps: React Native components, an offline-first database on RxDB, and connectors for WooCommerce, Medusa and Vendure.',
        url: `${siteUrl}/`, codeRepository: 'https://github.com/TallyUI/tallyui',
        programmingLanguage: 'TypeScript', license: 'https://opensource.org/licenses/MIT',
        author: { '@id': `${siteUrl}/#organization` },
      },
    ],
  };
}

export function breadcrumbJsonLd(siteUrl: string, crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.path === '/' ? `${siteUrl}/` : `${siteUrl}${c.path}`,
    })),
  };
}

export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
