import * as React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@tallyui/theme';

type TextareaProps = TextInputProps & {
  className?: string;
};

const Textarea = React.forwardRef<TextInput, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        multiline
        textAlignVertical="top"
        className={cn(
          'min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground web:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
          className,
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
export type { TextareaProps };
