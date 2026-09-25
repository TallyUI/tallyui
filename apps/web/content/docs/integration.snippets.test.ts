// Guards `integration.mdx`'s code blocks against API rot: every fenced ts/tsx
// block is extracted and typechecked against the real workspace packages, so
// a renamed or removed export the guide still shows breaks this test, not a
// reader copying the snippet into their app.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

// vitest (root `vitest.config.ts`) always runs from the repo root, so resolve
// from `process.cwd()` rather than `import.meta.url`: Vite's dev transform
// can rewrite this file's `import.meta.url` to a non-`file:` scheme.
const repoRoot = `${process.cwd()}/`;
const mdxPath = path.join(repoRoot, 'apps/web/content/docs/integration.mdx');
const rootTsconfigPath = path.join(repoRoot, 'tsconfig.json');
// `@tallyui/*` imports resolve via the root tsconfig's `paths` regardless of
// this directory; a snippet's own npm imports (`rxdb`, `react`) resolve from
// here the ordinary Node way, so it has to be a package with both installed.
const virtualDir = path.join(repoRoot, 'packages/pos/.snippet-check');

interface Snippet {
  ext: 'ts' | 'tsx';
  code: string;
}

/** Every ```ts / ```tsx fenced block in an .mdx file's raw text, in source order. */
export function extractSnippets(mdx: string): Snippet[] {
  const snippets: Snippet[] = [];
  const fence = /```(tsx?)\n([\s\S]*?)```/g;
  for (let match = fence.exec(mdx); match; match = fence.exec(mdx)) {
    snippets.push({ ext: match[1] as 'ts' | 'tsx', code: match[2] });
  }
  return snippets;
}

/** The root tsconfig's compilerOptions: `paths` resolves `@tallyui/*` straight to package source, so no build is needed first. */
function workspaceCompilerOptions(): ts.CompilerOptions {
  const configFile = ts.readConfigFile(rootTsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  return { ...parsed.options, noEmit: true };
}

/**
 * Typechecks `snippets` together as one program: each is a virtual file
 * under `.snippet-check/`, served from memory; every import it makes (a
 * `@tallyui/*` package, `rxdb`, `react`, ...) resolves to the real files on
 * disk via the workspace's own module resolution. Diagnostics from outside
 * the virtual files (a pre-existing error in a workspace package) are not
 * this test's concern and are filtered out.
 */
function typecheckSnippets(snippets: Snippet[]): ts.Diagnostic[] {
  const options = workspaceCompilerOptions();
  const files = new Map(snippets.map((s, i) => [`${virtualDir}/snippet-${i}.${s.ext}`, s.code]));
  const base = ts.createCompilerHost(options, true);

  const host: ts.CompilerHost = {
    ...base,
    fileExists: (fileName) => files.has(fileName) || base.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? base.readFile(fileName),
    getSourceFile: (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
      const code = files.get(fileName);
      return code !== undefined
        ? ts.createSourceFile(fileName, code, languageVersionOrOptions, true)
        : base.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    },
    writeFile: () => {},
  };

  const program = ts.createProgram({ rootNames: [...files.keys()], options, host });
  return ts.getPreEmitDiagnostics(program).filter((d) => d.file && files.has(d.file.fileName));
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  if (diagnostics.length === 0) return '(no diagnostics)';
  return ts.formatDiagnostics(diagnostics, {
    getCurrentDirectory: () => repoRoot,
    getCanonicalFileName: (f) => f,
    getNewLine: () => '\n',
  });
}

describe('integration.mdx snippets', () => {
  const mdx = readFileSync(mdxPath, 'utf8');
  const snippets = extractSnippets(mdx);

  it('extracts one snippet per documented section', () => {
    // Building a POS app documents 8 sections, each with exactly one code block.
    expect(snippets).toHaveLength(8);
  });

  it(
    'typechecks every snippet against the workspace packages, using only real, exported APIs',
    () => {
      const diagnostics = typecheckSnippets(snippets);
      expect(diagnostics, formatDiagnostics(diagnostics)).toHaveLength(0);
    },
    60_000,
  );
});
