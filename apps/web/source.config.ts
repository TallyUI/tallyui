import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      // fumadocs' default themes, restated because the options type requires them.
      themes: { light: 'github-light', dark: 'github-dark' },
      // github-light's red, grey, orange and green fall below WCAG AA (4.5:1) on the
      // code-block background (#f1f1f1); swap in GitHub Primer's darker shades of the same hues.
      colorReplacements: {
        'github-light': {
          '#d73a49': '#cf222e',
          '#6a737d': '#57606a',
          '#e36209': '#953800',
          '#22863a': '#116329',
        },
      },
    },
  },
});
