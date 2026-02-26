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
import { QuantityStepperDemo } from '@/components/snacks/quantity-stepper-snack';
import { DiscountBadgeDemo } from '@/components/snacks/discount-badge-snack';
import { CartNoteInputDemo } from '@/components/snacks/cart-note-input-snack';
import { CartLineActionsDemo } from '@/components/snacks/cart-line-actions-snack';
import { ProductListDemo } from '@/components/snacks/product-list-snack';
import { CategoryNavDemo } from '@/components/snacks/category-nav-snack';
import { ProductVariantPickerDemo } from '@/components/snacks/product-variant-picker-snack';
import { ChangeDisplayDemo } from '@/components/snacks/change-display-snack';
import { CashTenderedDemo } from '@/components/snacks/cash-tendered-snack';
import { ReceiptPreviewDemo } from '@/components/snacks/receipt-preview-snack';
import { OrderStatusBadgeDemo } from '@/components/snacks/order-status-badge-snack';
import { OrderCardDemo } from '@/components/snacks/order-card-snack';
import { OrderListDemo } from '@/components/snacks/order-list-snack';
import { OrderDetailDemo } from '@/components/snacks/order-detail-snack';
import { CashCountInputDemo } from '@/components/snacks/cash-count-input-snack';
import { RegisterSummaryDemo } from '@/components/snacks/register-summary-snack';
import { RegisterOpenCloseDemo } from '@/components/snacks/register-open-close-snack';
import { CustomerFormDemo } from '@/components/snacks/customer-form-snack';
import { CustomerOrderHistoryDemo } from '@/components/snacks/customer-order-history-snack';
import { SettingsRowDemo } from '@/components/snacks/settings-row-snack';
import { SettingsGroupDemo } from '@/components/snacks/settings-group-snack';
import { ConnectorStatusDemo } from '@/components/snacks/connector-status-snack';

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
    QuantityStepperDemo,
    DiscountBadgeDemo,
    CartNoteInputDemo,
    CartLineActionsDemo,
    ProductListDemo,
    CategoryNavDemo,
    ProductVariantPickerDemo,
    ChangeDisplayDemo,
    CashTenderedDemo,
    ReceiptPreviewDemo,
    OrderStatusBadgeDemo,
    OrderCardDemo,
    OrderListDemo,
    OrderDetailDemo,
    CashCountInputDemo,
    RegisterSummaryDemo,
    RegisterOpenCloseDemo,
    CustomerFormDemo,
    CustomerOrderHistoryDemo,
    SettingsRowDemo,
    SettingsGroupDemo,
    ConnectorStatusDemo,
    ...components,
  };
}
