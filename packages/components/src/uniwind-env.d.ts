/**
 * Type augmentations for React Native components to support className prop.
 * Uniwind provides these at runtime — this file ensures TypeScript accepts them.
 */
export {};

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }

  interface TextProps {
    className?: string;
  }

  interface ImagePropsBase {
    className?: string;
  }

  interface PressableProps {
    className?: string;
  }

  interface FlatListProps<ItemT> {
    contentContainerClassName?: string;
  }

  interface ScrollViewProps {
    contentContainerClassName?: string;
  }
}
