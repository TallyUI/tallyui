import * as React from 'react';
import { Text } from 'react-native';
import { Slot } from '../slot';
import type { RootProps } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TextClassContext = React.createContext<string | undefined>(undefined);

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<Text, RootProps>(function Root(
  { asChild, className, ...props },
  ref
) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : Text;

  // Merge context className with prop className.
  // The styled component layer (cn/tailwind-merge) handles deduplication.
  const mergedClassName = textClass
    ? className
      ? `${textClass} ${className}`
      : textClass
    : className;

  return <Component ref={ref} className={mergedClassName} {...props} />;
});

Root.displayName = 'TextRoot';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, TextClassContext };
