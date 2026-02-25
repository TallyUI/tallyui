import * as React from 'react';
import { Text } from 'react-native';
import { Slot } from '../slot';
import type { RootContext as RootContextType, RootProps } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Label compound components cannot be rendered outside the Label.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<Text, RootProps>(function Root(
  { asChild, nativeID, ...props },
  ref
) {
  const Component = asChild ? Slot : Text;

  return (
    <RootContext.Provider value={{ nativeID }}>
      <Component ref={ref} nativeID={nativeID} {...props} />
    </RootContext.Provider>
  );
});

Root.displayName = 'LabelRoot';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, useRootContext };
