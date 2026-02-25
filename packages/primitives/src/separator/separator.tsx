import * as React from 'react';
import { View } from 'react-native';
import { Slot } from '../slot';
import type { RootProps } from './types';

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<View, RootProps>(function Root(
  { asChild, orientation = 'horizontal', decorative = false, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      role={decorative ? 'presentation' : 'separator'}
      aria-orientation={orientation}
      {...props}
    />
  );
});

Root.displayName = 'SeparatorRoot';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root };
