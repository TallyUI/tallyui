import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 px-6">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm font-medium text-fd-muted-foreground mb-4 tracking-wider uppercase">
          Open Source
        </p>
        <h1 className="text-5xl font-bold mb-6 tracking-tight">
          Tally UI
        </h1>
        <p className="text-xl text-fd-muted-foreground mb-8 leading-relaxed">
          Composable UI primitives for building point-of-sale systems.
          Connect any backend. Ship to any platform.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/docs"
            className="px-6 py-3 bg-fd-primary text-fd-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>
          <Link
            href="/docs/connectors"
            className="px-6 py-3 border border-fd-border rounded-lg font-medium hover:bg-fd-accent transition-colors"
          >
            Browse Connectors
          </Link>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="p-4 rounded-lg border border-fd-border">
            <h3 className="font-semibold mb-1">Any Backend</h3>
            <p className="text-sm text-fd-muted-foreground">
              WooCommerce, MedusaJS, Vendure, Shopify, and more through a pluggable connector system.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-fd-border">
            <h3 className="font-semibold mb-1">Local-First</h3>
            <p className="text-sm text-fd-muted-foreground">
              Built on RxDB for offline-capable, reactive data that syncs when connected.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-fd-border">
            <h3 className="font-semibold mb-1">Cross-Platform</h3>
            <p className="text-sm text-fd-muted-foreground">
              Powered by Expo. Ship to iOS, Android, Web, and Desktop from one codebase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
