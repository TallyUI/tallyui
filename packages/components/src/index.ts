/// <reference path="./uniwind-env.d.ts" />

// Generic UI components
export * from './ui';

// Product components
export {
  ProductTitle,
  ProductPrice,
  ProductImage,
  ProductSku,
  ProductStockBadge,
  ProductCard,
  ProductGrid,
  type ProductTitleProps,
  type ProductPriceProps,
  type ProductImageProps,
  type ProductSkuProps,
  type ProductStockBadgeProps,
  type ProductCardProps,
  type ProductGridProps,
  ProductList,
  type ProductListProps,
  CategoryNav,
  type CategoryNavProps,
  type CategoryItem,
  ProductVariantPicker,
  type ProductVariantPickerProps,
  type VariantOption,
} from './product';

// Cart components
export {
  CartLine,
  CartTotal,
  CartPanel,
  DiscountBadge,
  CartNoteInput,
  type CartLineProps,
  type CartLineItem,
  type CartTotalProps,
  type CartPanelProps,
  type DiscountBadgeProps,
  type CartNoteInputProps,
} from './cart';

// Input components
export {
  SearchInput,
  type SearchInputProps,
  FilterChip,
  FilterChipGroup,
  type FilterChipProps,
  type FilterChipGroupProps,
  type ChipItem,
  QuantityStepper,
  type QuantityStepperProps,
} from './input';

// Customer components
export {
  CustomerCard,
  CustomerSelect,
  type CustomerCardProps,
  type CustomerSelectProps,
} from './customer';

// Checkout components
export {
  PaymentMethodCard,
  PaymentSelector,
  type PaymentMethodCardProps,
  type PaymentSelectorProps,
  type PaymentMethod,
  OrderSummaryLine,
  OrderSummary,
  type OrderSummaryLineProps,
  type OrderSummaryProps,
  type OrderSummaryPayment,
  ChangeDisplay,
  type ChangeDisplayProps,
} from './checkout';

// Order components
export { OrderStatusBadge, type OrderStatusBadgeProps, type OrderStatus } from './order';

// Settings components
export { SettingsRow, type SettingsRowProps } from './settings';
