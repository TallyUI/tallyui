#!/usr/bin/env node
// Counts the changesets not yet consumed. In pre mode, `changeset version`
// keeps the files and lists their ids in pre.json; those are consumed.
// Same rule `changesets/action` uses to choose publish or version
// (`readChangesetState`: in `mode: "pre"`, the ids in pre.json are filtered out).
// Node built-ins only: the Release workflow's `pending` job runs no install.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function countPendingChangesets(changesetDir) {
  const preFile = path.join(changesetDir, 'pre.json');
  // An unreadable or invalid pre.json throws: 0 would mean "publish".
  const pre = existsSync(preFile) ? JSON.parse(readFileSync(preFile, 'utf8')) : undefined;
  const consumed = new Set(pre?.mode === 'pre' ? pre.changesets : []);
  return readdirSync(changesetDir, { withFileTypes: true }).filter(entry =>
    entry.isFile() &&
    entry.name.endsWith('.md') &&
    entry.name !== 'README.md' &&
    !consumed.has(entry.name.slice(0, -'.md'.length))
  ).length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(String(countPendingChangesets('.changeset')));
}
