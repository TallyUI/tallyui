import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { ExpoSnack } from '@/components/expo-snack';
import { SchemaComparison } from '@/components/schema-comparison';
import { ProductTitleSnack } from '@/components/product-title-snack';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...(defaultMdxComponents as MDXComponents),
    ExpoSnack,
    SchemaComparison,
    ProductTitleSnack,
    ...components,
  };
}
