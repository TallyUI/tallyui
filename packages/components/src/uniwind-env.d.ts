/**
 * Type augmentations for React Native components to support className prop.
 * Uniwind provides these at runtime — this file ensures TypeScript accepts them.
 */
import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
    // react-native-web turns each entry into a data-* DOM attribute (e.g. { print: 'hide' } → data-print="hide").
    // TV6a's first use: the print-style hook (`dataSet={{ print: 'hide' }}`) that TV6b lifts.
    dataSet?: { [key: string]: string | number };
  }

  interface TextProps {
    className?: string;
  }

  interface TextInputProps {
    // Uniwind reads an accent-* class for the placeholder colour.
    placeholderTextColorClassName?: string;
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
