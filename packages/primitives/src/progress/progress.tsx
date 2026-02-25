import * as React from 'react';
import { View } from 'react-native';
import { Slot } from '../slot';
import type { RootContext as RootContextType, RootProps, IndicatorProps } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX = 100;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Progress compound components cannot be rendered outside the Progress.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultGetValueLabel(value: number, max: number) {
  return `${Math.round((value / max) * 100)}%`;
}

function isValidValueNumber(value: any, max: number): value is number {
  return typeof value === 'number' && !isNaN(value) && value <= max && value >= 0;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<View, RootProps>(function Root(
  { asChild, value: valueProp, max: maxProp, getValueLabel = defaultGetValueLabel, ...props },
  ref
) {
  const max = maxProp ?? DEFAULT_MAX;
  const isIndeterminate = valueProp === null || valueProp === undefined;
  const value = isIndeterminate ? null : isValidValueNumber(valueProp, max) ? valueProp : 0;

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ value, max }}>
      <Component
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value != null ? getValueLabel(value, max) : undefined}
        {...props}
      />
    </RootContext.Provider>
  );
});

Root.displayName = 'ProgressRoot';

// ---------------------------------------------------------------------------
// Indicator
// ---------------------------------------------------------------------------

const Indicator = React.forwardRef<View, IndicatorProps>(function Indicator(
  { asChild, ...props },
  ref
) {
  useRootContext();

  const Component = asChild ? Slot : View;

  return <Component ref={ref} {...props} />;
});

Indicator.displayName = 'ProgressIndicator';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Indicator, useRootContext };
