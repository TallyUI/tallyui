import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { ConnectorGrid } from '@/components/home/connector-grid';
import { LiveDemo } from '@/components/home/live-demo';
import { gitConfig } from '@/lib/layout.shared';
import { siteUrl, tallyVersion } from '@/lib/site';
import { homeJsonLd, jsonLdScript } from '@/lib/structured-data';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', siteName: 'Tally UI' },
  twitter: { card: 'summary_large_image' },
};

export default function HomePage() {
  return (
    <div className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd(siteUrl)) }} />
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Open-source building blocks for point-of-sale apps
          </h1>
          <p className="mt-6 text-lg text-fd-foreground/80">
            React Native components, an offline-first database on RxDB, and connectors for WooCommerce, Medusa and Vendure. Build one POS for iOS, Android, the web and desktop.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground hover:opacity-90"
            >
              Read the docs
            </Link>
            <a
              href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
              className="rounded-lg border border-fd-border px-6 py-3 font-medium hover:bg-fd-accent"
            >
              View on GitHub
            </a>
          </div>
        </div>
        <LiveDemo />
      </section>
      <ConnectorGrid />
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="text-2xl font-semibold tracking-tight">Install TallyUI {tallyVersion}</h2>
        <CodeBlock className="mt-4">
          <Pre className="py-3 pl-4 pr-12">{`pnpm add @tallyui/core@${tallyVersion} @tallyui/database@${tallyVersion} \\
  @tallyui/components@${tallyVersion} @tallyui/primitives@${tallyVersion} @tallyui/theme@${tallyVersion} \\
  @tallyui/connector-medusa@${tallyVersion} rxdb@17.5.0 rxjs`}</Pre>
        </CodeBlock>
        <p className="mt-4 text-fd-foreground/80">
          Swap the connector for <code>@tallyui/connector-woocommerce</code> or <code>@tallyui/connector-vendure</code>. Keep every <code>@tallyui</code> package on the same version, and <code>rxdb</code> at exactly 17.5.0. The <Link href="/docs" className="underline underline-offset-4">quick start</Link> walks through the rest.
        </p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-2xl font-semibold tracking-tight">What TallyUI gives you</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-lg border border-fd-border p-4">
            <h3 className="font-semibold mb-1">Any Backend</h3>
            <p className="text-sm text-fd-foreground/80">
              WooCommerce, MedusaJS, Vendure, Shopify, and more through a pluggable connector system.
            </p>
          </div>
          <div className="rounded-lg border border-fd-border p-4">
            <h3 className="font-semibold mb-1">Local-First</h3>
            <p className="text-sm text-fd-foreground/80">
              Built on RxDB for offline-capable, reactive data that syncs when connected.
            </p>
          </div>
          <div className="rounded-lg border border-fd-border p-4">
            <h3 className="font-semibold mb-1">Cross-Platform</h3>
            <p className="text-sm text-fd-foreground/80">
              Powered by Expo. Ship to iOS, Android, Web, and Desktop from one codebase.
            </p>
          </div>
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-6 pb-12 text-sm text-fd-foreground/80">Tally UI is MIT licensed. <Link href="/docs/changelog" className="underline underline-offset-4">Changelog</Link></footer>
    </div>
  );
}
