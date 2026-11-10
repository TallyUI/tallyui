/**
 * Port of WCPOS v2 `packages/core/src/contexts/scale/index.tsx` and
 * `packages/components/src/lib/device.ts`.
 * The native scope is a prop so components do not depend on Uniwind's ScopedVariables.
 */
import * as React from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import type { ScaleOverride } from '@tallyui/theme';
import {
  SCALE_VARIABLE_NAMES, resolveStep, scaleVariables,
  type Pointer, type ScaleStep, type ScaleVariables,
} from '@tallyui/theme';
import { usePointer } from './use-pointer';

export interface ScaleScopeProps {
  variables: ScaleVariables;
  children?: React.ReactNode;
}

export interface ScaleState {
  step: ScaleStep;
  pointer: Pointer;
  variables: ScaleVariables;
}

export interface ScaleProviderProps {
  /** The app's stored `ui.scale` setting (from `useAppSettings` in `@tallyui/pos`); missing or unknown means Auto. */
  scale?: ScaleOverride | null;
  /** Scopes the variables below it on native, e.g. Uniwind's ScopedVariables. Optional: the web root mirror covers the web. */
  scope?: React.ComponentType<ScaleScopeProps>;
  children?: React.ReactNode;
}

const ScaleContext = React.createContext<ScaleState>({
  step: 'regular',
  pointer: 'coarse',
  variables: scaleVariables('regular', 'coarse'),
});

/** Mirror on the root because portalled content leaves the subtree. */
function useRootScaleMirror(variables: ScaleVariables) {
  React.useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.documentElement.style;
    for (const name of SCALE_VARIABLE_NAMES) style.setProperty(name, `${variables[name]}px`);
    return () => {
      for (const name of SCALE_VARIABLE_NAMES) style.removeProperty(name);
    };
  }, [variables]);
}

export function ScaleProvider({ scale, scope: Scope, children }: ScaleProviderProps): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const pointer = usePointer();
  const extent = Platform.OS === 'web' ? width : Math.min(width, height);
  const step = resolveStep(scale, extent);
  const variables = React.useMemo(() => scaleVariables(step, pointer), [step, pointer]);
  const state = React.useMemo(() => ({ step, pointer, variables }), [step, pointer, variables]);
  useRootScaleMirror(variables);

  return (
    <ScaleContext.Provider value={state}>
      {Scope ? <Scope variables={variables}>{children}</Scope> : children}
    </ScaleContext.Provider>
  );
}

export function useScale(): ScaleState {
  return React.useContext(ScaleContext);
}
