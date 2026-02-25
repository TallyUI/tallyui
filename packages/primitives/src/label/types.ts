import type { SlottableTextProps } from '../types';

interface RootProps extends SlottableTextProps {
  nativeID?: string;
}

interface RootContext {
  nativeID: string | undefined;
}

export type { RootProps, RootContext };
