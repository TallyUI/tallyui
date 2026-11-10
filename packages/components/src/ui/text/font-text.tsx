import * as React from 'react';
import { Platform, type TextProps } from 'react-native';
import { fontFamilyStyle } from '@tallyui/theme';
import { useFontType } from '../../fonts';

const wrappers = new Map<React.ElementType, React.ComponentType<TextProps>>();

/** Wraps a text component (RN Text or Slot) so it draws the active type set's face. Cached: the same Base always returns the same wrapper. */
export function withFont<C extends React.ElementType>(Base: C): C {
  let Wrapper = wrappers.get(Base);
  if (!Wrapper) {
    Wrapper = function FontText({ className, style, ...props }: TextProps) {
      const { type } = useFontType();
      const family = /(^|\s)font-(mono|sans|serif)(\s|$)/.test(className ?? '')
        ? undefined
        : /(^|\s)tabular-nums(\s|$)/.test(className ?? '') ? type.num ?? type.body : type.body;
      return React.createElement(Base, {
        ...props, className,
        style: family ? [fontFamilyStyle(family, Platform.OS === 'web'), style] : style,
      });
    };
    wrappers.set(Base, Wrapper);
  }
  return Wrapper as unknown as C;
}
