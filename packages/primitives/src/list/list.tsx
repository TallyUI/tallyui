import React from 'react';
import { FlatList, View } from 'react-native';
import type { ListRootProps, ListItemProps } from './types';

const ItemContext = React.createContext<{ item: unknown; index: number } | null>(null);

export function useItemContext() {
  const context = React.useContext(ItemContext);
  if (!context) {
    throw new Error('useItemContext must be used within a List.Item');
  }
  return context;
}

function RootInner<T>(
  { data, renderItem, keyExtractor, estimatedItemSize, ...props }: ListRootProps<T>,
  ref: React.Ref<FlatList<T>>
) {
  return (
    <FlatList
      ref={ref}
      data={data}
      keyExtractor={keyExtractor}
      getItemLayout={
        estimatedItemSize
          ? (_, index) => ({
              length: estimatedItemSize,
              offset: estimatedItemSize * index,
              index,
            })
          : undefined
      }
      renderItem={({ item, index }) => (
        <ItemContext.Provider value={{ item, index }}>
          {renderItem({ item, index })}
        </ItemContext.Provider>
      )}
      {...props}
    />
  );
}

export const Root = React.forwardRef(RootInner) as <T>(
  props: ListRootProps<T> & { ref?: React.Ref<FlatList<T>> }
) => React.ReactElement | null;

export const Item = React.forwardRef<View, ListItemProps>(
  ({ children, ...props }, ref) => (
    <View ref={ref} {...props}>
      {children}
    </View>
  )
);
Item.displayName = 'ListItem';
