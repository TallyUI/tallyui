import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { ExpoSnack } from '@/components/expo-snack';
import { SchemaComparison } from '@/components/schema-comparison';
import { ProductTitleDemo } from '@/components/snacks/product-title-snack';
import { ProductPriceDemo } from '@/components/snacks/product-price-snack';
import { ProductImageDemo } from '@/components/snacks/product-image-snack';
import { ProductSkuDemo } from '@/components/snacks/product-sku-snack';
import { ProductStockBadgeDemo } from '@/components/snacks/product-stock-badge-snack';
import { CartLineDemo } from '@/components/snacks/cart-line-snack';
import { CartTotalDemo } from '@/components/snacks/cart-total-snack';
import { SearchInputDemo } from '@/components/snacks/search-input-snack';
import { FilterChipGroupDemo } from '@/components/snacks/filter-chip-group-snack';
import { ProductCardDemo } from '@/components/snacks/product-card-snack';
import { ProductGridDemo } from '@/components/snacks/product-grid-snack';
import { CartPanelDemo } from '@/components/snacks/cart-panel-snack';
import { CustomerCardDemo } from '@/components/snacks/customer-card-snack';
import { CustomerSelectDemo } from '@/components/snacks/customer-select-snack';
import { PaymentMethodCardDemo } from '@/components/snacks/payment-method-card-snack';
import { PaymentSelectorDemo } from '@/components/snacks/payment-selector-snack';
import { OrderSummaryLineDemo } from '@/components/snacks/order-summary-line-snack';
import { OrderSummaryDemo } from '@/components/snacks/order-summary-snack';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...(defaultMdxComponents as MDXComponents),
    ExpoSnack,
    SchemaComparison,
    ProductTitleDemo,
    ProductPriceDemo,
    ProductImageDemo,
    ProductSkuDemo,
    ProductStockBadgeDemo,
    CartLineDemo,
    CartTotalDemo,
    SearchInputDemo,
    FilterChipGroupDemo,
    ProductCardDemo,
    ProductGridDemo,
    CartPanelDemo,
    CustomerCardDemo,
    CustomerSelectDemo,
    PaymentMethodCardDemo,
    PaymentSelectorDemo,
    OrderSummaryLineDemo,
    OrderSummaryDemo,
    ...components,
  };
}
