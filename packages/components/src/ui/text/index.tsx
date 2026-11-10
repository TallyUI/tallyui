import * as React from 'react';
import { Text as RNText } from 'react-native';
import { Slot, TextClassContext } from '@tallyui/primitives';
import { cn, MAX_FONT_SCALE } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';
import { withFont } from './font-text';

const textVariants = cva('text-foreground web:select-text text-base', {
  variants: {
    variant: {
      default: '',
      link: 'web:hover:underline web:focus:underline web:hover:cursor-pointer group-active:underline',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type TextProps = React.ComponentPropsWithoutRef<typeof RNText> &
  VariantProps<typeof textVariants> & {
    asChild?: boolean;
  };

function Text({ className, variant, asChild = false, children, maxFontSizeMultiplier = MAX_FONT_SCALE, ...props }: TextProps) {
  const textClass = React.useContext(TextClassContext);
  const Component = withFont(asChild ? Slot : RNText);

  return (
    <Component className={cn(textVariants({ variant }), textClass, className)} {...props} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {children}
    </Component>
  );
}

export { Text, TextClassContext, textVariants };
export type { TextProps };
