import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {/* DocsPage renders no <main>; display: contents keeps its children in DocsLayout's grid. */}
      <main className="contents">{children}</main>
    </DocsLayout>
  );
}
