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
  ProductTable,
  ViewToggle,
  type ViewToggleProps,
  defaultProductColumns,
  useDefaultProductColumns,
  type ProductTableProps,
  type ProductTableColumn,
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
  CustomerPicker,
  type CustomerPickerProps,
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
  RegisterPicker,
  type RegisterPickerProps,
  type RegisterPickerRegister,
  OpenRegisterCard,
  type OpenRegisterCardProps,
  RegisterBar,
  type RegisterBarProps,
  describeRegisterBarPill,
  type RegisterBarPill,
  MovementSheet,
  type MovementSheetProps,
  RegisterPanel,
  type RegisterPanelProps,
  RegisterColumn,
  type RegisterColumnProps,
  RegisterCount,
  APPROVAL_REQUIRED_TEXT,
  type RegisterCountProps,
  ClosureSheet,
  type ClosureSheetProps,
} from './register';

// Settings components
export {
  SettingsRow,
  type SettingsRowProps,
  SettingsGroup,
  type SettingsGroupProps,
  ConnectorStatus,
  type ConnectorStatusProps,
  type ConnectionStatus,
} from './settings';

// Sale components
export {
  Cart, CartBar, Tender, SplitTender, DiscountForm, DiscountChips, parseDiscount, discountLabel,
  PriceForm, parsePrice,
  ChargeForm, type ChargeFormProps,
  Catalogue, formatStockSyncTime, Receipt, injectPrintStyle, SyncStatus, OrdersList, type OrderHistoryRow, orderReference,
  ParkedSales, type ParkedSalesProps,
} from './sale';

// Layout components
export {
  POSLayout,
  type POSLayoutProps,
  CheckoutLayout,
  type CheckoutLayoutProps,
  SettingsLayout,
  type SettingsLayoutProps,
  LiveTabScreen,
  type LiveTabScreenProps,
  type LiveTabScreenState,
  StoreSettingsChoiceScreen,
  type StoreSettingsChoiceScreenProps,
} from './layout';
