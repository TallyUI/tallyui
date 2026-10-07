import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const lines: string[] = [];
  lines.push('# TallyUI');
  lines.push('');
  lines.push('> Composable UI primitives for building point-of-sale systems. Connect any backend. Ship to any platform.');
  lines.push('');
  for (const page of source.getPages()) {
    lines.push(`- [${page.data.title}](${page.url}): ${page.data.description}`);
  }
  return new Response(lines.join('\n'));
}
