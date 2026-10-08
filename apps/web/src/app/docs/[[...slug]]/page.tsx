import { getPageImage, source } from '@/lib/source';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { LLMCopyButton, ViewOptions } from '@/components/ai/page-actions';
import { docsPageMetadata } from '@/lib/docs-metadata';
import { gitConfig } from '@/lib/layout.shared';
import { siteUrl } from '@/lib/site';
import { breadcrumbJsonLd, jsonLdScript, type Crumb } from '@/lib/structured-data';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const crumbs: Crumb[] = [{ name: 'Tally UI', path: '/' }, { name: 'Docs', path: '/docs' }];
  for (let i = 1; i <= page.slugs.length; i++) {
    const parent = source.getPage(page.slugs.slice(0, i));
    if (parent) crumbs.push({ name: parent.data.title, path: parent.url });
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(siteUrl, crumbs)) }} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <LLMCopyButton markdownUrl={`${page.url}.mdx`} />
        <ViewOptions
          markdownUrl={`${page.url}.mdx`}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/web/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            // `as any`: dual @types/react versions on Vercel cause ref type mismatch
            a: createRelativeLink(source, page) as any,
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return docsPageMetadata({
    title: page.data.title,
    description: page.data.description,
    url: page.url,
    slugs: page.slugs,
    imageUrl: getPageImage(page).url,
  });
}
