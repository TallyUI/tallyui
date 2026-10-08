import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// Sitemap lastmod is the last git commit of each page's source file (marketing backlog item 86).
// It needs full history: CI uses fetch-depth: 0 and Vercel builds with VERCEL_DEEP_CLONE=true.
// In a shallow clone, a file last committed at the boundary gets no lastmod rather than a wrong one.
function git(args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function pageLastModified(file: string): string | undefined {
  const [hash, date] = git(['log', '-1', '--format=%H %cI', '--', `:(top)${file}`]).split(' ');
  const shallowPath = git(['rev-parse', '--git-path', 'shallow']);
  const boundaryHashes = existsSync(shallowPath)
    ? readFileSync(shallowPath, 'utf8').split('\n')
    : [];

  return date && !boundaryHashes.includes(hash) ? date : undefined;
}
