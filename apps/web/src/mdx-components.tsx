import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { ExpoSnack } from '@/components/expo-snack';
import { SchemaComparison } from '@/components/schema-comparison';
import { ProductTitleSnack } from '@/components/product-title-snack';
import { ProductTitleDemo } from '@/components/snacks/product-title-snack';
import { ProductPriceDemo } from '@/components/snacks/product-price-snack';
import { ProductImageDemo } from '@/components/snacks/product-image-snack';
import { ProductSkuDemo } from '@/components/snacks/product-sku-snack';
import { ProductStockBadgeDemo } from '@/components/snacks/product-stock-badge-snack';
import { CartLineDemo } from '@/components/snacks/cart-line-snack';
import { CartTotalDemo } from '@/components/snacks/cart-total-snack';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...(defaultMdxComponents as MDXComponents),
    ExpoSnack,
    SchemaComparison,
    ProductTitleSnack,
    ProductTitleDemo,
    ProductPriceDemo,
    ProductImageDemo,
    ProductSkuDemo,
    ProductStockBadgeDemo,
    CartLineDemo,
    CartTotalDemo,
    ...components,
  };
}
