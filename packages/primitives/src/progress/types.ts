import type { SlottableViewProps } from '../types';

interface RootProps extends SlottableViewProps {
  value?: number | null;
  max?: number;
  getValueLabel?: (value: number, max: number) => string;
}

interface IndicatorProps extends SlottableViewProps {}

interface RootContext {
  value: number | null;
  max: number;
}

export type { RootProps, IndicatorProps, RootContext };
