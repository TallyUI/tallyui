import * as React from 'react';
import { Text as RNText } from 'react-native';
import { Slot, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

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

function Text({ className, variant, asChild = false, children, ...props }: TextProps) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;

  return (
    <Component className={cn(textVariants({ variant }), textClass, className)} {...props}>
      {children}
    </Component>
  );
}

export { Text, TextClassContext, textVariants };
export type { TextProps };
