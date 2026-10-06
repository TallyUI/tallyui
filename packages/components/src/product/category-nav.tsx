import { Pressable, ScrollView, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CategoryItem {
  id: string;
  name: string;
}

export interface CategoryNavProps extends Omit<ViewProps, 'children'> {
  categories: CategoryItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function CategoryNav({
  categories,
  selectedId,
  onSelect,
  orientation = 'horizontal',
  className,
  ...viewProps
}: CategoryNavProps) {
  const isHorizontal = orientation === 'horizontal';

  const content = categories.map((cat) => {
    const active = cat.id === selectedId;
    return (
      <Pressable
        key={cat.id}
        testID={`category-nav-${cat.id}`}
        role="radio"
        aria-checked={active}
        onPress={() => onSelect(cat.id)}
        className={cn(
          'rounded-md px-3 py-1.5',
          active ? 'bg-primary' : 'bg-muted',
        )}
      >
        <Text
          className={cn(
            'text-sm font-medium',
            active ? 'text-primary-foreground' : 'text-foreground',
          )}
        >
          {cat.name}
        </Text>
      </Pressable>
    );
  });

  if (isHorizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row gap-2 px-3 py-2"
        className={className}
        role="radiogroup"
        accessibilityLabel="Categories"
        {...viewProps}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View className={cn('gap-1 p-2', className)} role="radiogroup" accessibilityLabel="Categories" {...viewProps}>
      {content}
    </View>
  );
}
