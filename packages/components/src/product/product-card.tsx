import { Pressable, View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { ProductImage } from './product-image';
import { ProductTitle } from './product-title';
import { ProductPrice } from './product-price';

export interface ProductCardProps extends Omit<ViewProps, 'children'> {
  doc: any;
  onPress?: () => void;
  imageSize?: number;
  currencySymbol?: string;
  className?: string;
}

export function ProductCard({ doc, onPress, imageSize = 80, currencySymbol, className, ...viewProps }: ProductCardProps) {
  const content = (
    <View className={cn('items-center gap-2 rounded-lg bg-card p-3', className)} {...viewProps}>
      <ProductImage doc={doc} size={imageSize} className="rounded-md" />
      <ProductTitle doc={doc} className="text-sm" numberOfLines={2} />
      <ProductPrice doc={doc} currencySymbol={currencySymbol} />
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
