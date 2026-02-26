import { Pressable } from 'react-native';
import { cn } from '@tallyui/theme';
import { VStack, type VStackProps } from '../ui';
import { ProductImage } from './product-image';
import { ProductTitle } from './product-title';
import { ProductPrice } from './product-price';

export interface ProductCardProps extends Omit<VStackProps, 'children'> {
  doc: any;
  onPress?: () => void;
  imageSize?: number;
  currencySymbol?: string;
  className?: string;
}

export function ProductCard({ doc, onPress, imageSize = 80, currencySymbol, className, ...props }: ProductCardProps) {
  const content = (
    <VStack space="sm" className={cn('items-center rounded-lg bg-card p-3', className)} {...props}>
      <ProductImage doc={doc} size={imageSize} className="rounded-md" />
      <ProductTitle doc={doc} className="text-sm" numberOfLines={2} />
      <ProductPrice doc={doc} currencySymbol={currencySymbol} />
    </VStack>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
