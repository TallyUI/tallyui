import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import { Analytics } from '@/components/analytics';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Tally UI',
    template: '%s | Tally UI',
  },
  description: 'Composable UI primitives for building point-of-sale systems. Connect any backend. Ship to any platform.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        {/* Load the search dialog's chunks when search opens instead of with every page (backlog item 76). */}
        <RootProvider search={{ preload: false }}>{children}</RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
