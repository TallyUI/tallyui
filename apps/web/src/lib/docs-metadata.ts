import type { Metadata } from 'next';

// Section labels distinguish primitive and styled docs with the same page title.
const sectionLabels: Record<string, string> = { primitives: 'primitive', ui: 'styled' };

export function docsPageTitle(title: string, slugs: string[]): string {
  const label = slugs.length > 1 && sectionLabels[slugs[0]];
  return label ? `${title} (${label})` : title;
}

export function docsPageMetadata(page: {
  title: string;
  description?: string;
  url: string;
  slugs: string[];
  imageUrl: string;
}): Metadata {
  return {
    title: docsPageTitle(page.title, page.slugs),
    description: page.description,
    alternates: { canonical: page.url },
    openGraph: { url: page.url, images: page.imageUrl },
  };
}
