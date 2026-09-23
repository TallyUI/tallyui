import * as React from 'react';
import Svg, { type SvgProps } from 'react-native-svg';

export type SvgIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  accessibilityLabel?: string;
} & Omit<SvgProps, 'width' | 'height' | 'color'>;

export function createSvgIcon(name: string, render: (props: { strokeWidth: number }) => React.ReactNode) {
  function SvgIcon({ size = 16, color, strokeWidth = 2, accessibilityLabel, ...props }: SvgIconProps) {
    return (
      <Svg
        {...props}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke={color ?? 'currentColor'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        color={color}
        aria-hidden={accessibilityLabel === undefined}
        role={accessibilityLabel === undefined ? undefined : 'img'}
        aria-label={accessibilityLabel}
      >
        {render({ strokeWidth })}
      </Svg>
    );
  }

  SvgIcon.displayName = name;
  return SvgIcon;
}
