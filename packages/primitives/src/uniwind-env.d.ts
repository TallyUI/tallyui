/**
 * Type augmentations for React Native components to support className prop.
 * Uniwind/NativeWind provides these at runtime — this file ensures TypeScript accepts them.
 */
import 'react-native';

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

  interface TextInputProps {
    className?: string;
  }

  interface ScrollViewProps {
    contentContainerClassName?: string;
  }
}
