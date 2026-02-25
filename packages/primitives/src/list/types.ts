import type { FlatListProps, ViewProps } from 'react-native';

interface ListRootProps<T> extends Omit<FlatListProps<T>, 'renderItem'> {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactElement;
  estimatedItemSize?: number;
  keyExtractor?: (item: T, index: number) => string;
}

interface ListItemProps extends ViewProps {
  children?: React.ReactNode;
}

export type { ListRootProps, ListItemProps };
