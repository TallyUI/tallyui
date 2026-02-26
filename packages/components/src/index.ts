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
  CartLineActions,
  type CartLineActionsProps,
  type CartAction,
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
  CustomerForm,
  type CustomerFormProps,
  type CustomerFormValues,
  CustomerOrderHistory,
  type CustomerOrderHistoryProps,
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
  CashTendered,
  type CashTenderedProps,
  ReceiptPreview,
  type ReceiptPreviewProps,
  type ReceiptItem,
} from './checkout';

// Order components
export {
  OrderStatusBadge,
  type OrderStatusBadgeProps,
  type OrderStatus,
  OrderCard,
  type OrderCardProps,
  OrderList,
  type OrderListProps,
  OrderDetail,
  type OrderDetailProps,
  type OrderDetailLineItem,
} from './order';

// Register components
export {
  CashCountInput,
  type CashCountInputProps,
  type Denomination,
  RegisterSummary,
  type RegisterSummaryProps,
  type TransactionSummary,
  RegisterOpenClose,
  type RegisterOpenCloseProps,
} from './register';

// Settings components
export { SettingsRow, type SettingsRowProps } from './settings';
