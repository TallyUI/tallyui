import type { SlottableViewProps } from '../types';

interface RootProps extends SlottableViewProps {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

export type { RootProps };
