import type { MetadataRoute } from 'next';
import { pageLastModified } from '@/lib/page-dates';
import { siteUrl } from '@/lib/site';
import { source } from '@/lib/source';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: pageLastModified('apps/web/src/app/(home)/page.tsx'),
    },
    ...source.getPages().map((page) => ({
      url: `${siteUrl}${page.url}`,
      lastModified: pageLastModified(`apps/web/content/docs/${page.path}`),
    })),
  ];
}
