import { Pressable } from 'react-native';
import { cn } from '@tallyui/theme';
import { useProductTraits } from '@tallyui/core';
import { VStack, Text, type VStackProps } from '../ui';
import { ProductImage } from './product-image';
import { ProductTitle } from './product-title';
import { ProductPrice } from './product-price';

export interface ProductCardProps extends Omit<VStackProps, 'children'> {
  doc: any;
  onPress?: () => void;
  imageSize?: number;
  currencySymbol?: string;
  /** Shown in place of the price when the channel doesn't sell this product. */
  notSoldLabel?: string;
  className?: string;
}

export function ProductCard({ doc, onPress, imageSize = 80, currencySymbol, notSoldLabel = 'Not sold here', className, ...props }: ProductCardProps) {
  // No <ConnectorProvider> above: traits are unavailable, so the card
  // renders as an ordinary, sellable product.
  let traits: ReturnType<typeof useProductTraits> | undefined;
  try {
    traits = useProductTraits();
  } catch {
    traits = undefined;
  }
  const sellable = !traits || traits.isSellable(doc);

  const content = (
    <VStack
      space="sm"
      className={cn('items-center rounded-lg border border-border bg-card p-3', className)}
      {...props}
    >
      {/* Unsellable: the card keeps its opaque surface and only its contents dim, so
          it reads as lower contrast than its neighbours on any backdrop, in both themes. */}
      <ProductImage doc={doc} size={imageSize} className={cn('rounded-md', !sellable && 'opacity-50')} />
      <ProductTitle doc={doc} className={cn('text-sm', !sellable && 'opacity-50')} numberOfLines={2} />
      {sellable ? (
        <ProductPrice doc={doc} currencySymbol={currencySymbol} />
      ) : (
        <Text className="text-sm text-muted-foreground">{notSoldLabel}</Text>
      )}
    </VStack>
  );

  // Not sold in this channel: shown for awareness only (opt-in or the demo), never tappable.
  if (!sellable) {
    return <Pressable disabled aria-disabled onPress={undefined}>{content}</Pressable>;
  }
  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
