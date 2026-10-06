import { HomeLayout } from 'fumadocs-ui/layouts/home';
import Link from 'next/link';
import { baseOptions } from '@/lib/layout.shared';

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="mx-auto flex max-w-2xl flex-1 flex-col justify-center px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-4 text-fd-foreground/80">There&apos;s no page at this address. It may have moved, or the link may be wrong.</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/"
            className="rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground hover:opacity-90"
          >
            Go to the home page
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-fd-border px-6 py-3 font-medium hover:bg-fd-accent"
          >
            Read the docs
          </Link>
          <Link
            href="/docs/components"
            className="rounded-lg border border-fd-border px-6 py-3 font-medium hover:bg-fd-accent"
          >
            Browse the components
          </Link>
        </div>
      </div>
    </HomeLayout>
  );
}
