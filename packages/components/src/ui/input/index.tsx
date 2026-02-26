import * as React from 'react';
import { TextInput, View, type TextInputProps, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';

interface InputContextType {
  focused: boolean;
  disabled: boolean;
}

const InputContext = React.createContext<InputContextType>({
  focused: false,
  disabled: false,
});

function useInputContext() {
  return React.useContext(InputContext);
}

// Root container
interface InputRootProps extends ViewProps {
  disabled?: boolean;
}

const InputRoot = React.forwardRef<View, InputRootProps>(
  function InputRoot({ className, disabled = false, children, ...props }, ref) {
    const [focused, setFocused] = React.useState(false);

    return (
      <InputContext.Provider value={{ focused, disabled }}>
        <View
          ref={ref}
          className={cn(
            'flex h-10 flex-row items-center rounded-md border border-input bg-background px-3',
            focused && 'ring-2 ring-ring ring-offset-2',
            disabled && 'opacity-50',
            className,
          )}
          {...props}
        >
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child) && child.type === InputField) {
              return React.cloneElement(child as React.ReactElement<any>, {
                onFocus: (e: any) => {
                  setFocused(true);
                  (child.props as any).onFocus?.(e);
                },
                onBlur: (e: any) => {
                  setFocused(false);
                  (child.props as any).onBlur?.(e);
                },
              });
            }
            return child;
          })}
        </View>
      </InputContext.Provider>
    );
  }
);
InputRoot.displayName = 'InputRoot';

// Left/Right slots
const InputSlot = React.forwardRef<View, ViewProps>(
  function InputSlot({ className, ...props }, ref) {
    return (
      <View ref={ref} className={cn('justify-center', className)} {...props} />
    );
  }
);
InputSlot.displayName = 'InputSlot';

// The actual text input
const InputField = React.forwardRef<TextInput, TextInputProps>(
  function InputField({ className, ...props }, ref) {
    const { disabled } = useInputContext();

    return (
      <TextInput
        ref={ref}
        editable={!disabled}
        className={cn(
          'flex-1 text-sm text-foreground web:outline-none placeholder:text-muted-foreground',
          className,
        )}
        {...props}
      />
    );
  }
);
InputField.displayName = 'InputField';

// Convenience compound component
const Input = Object.assign(InputRoot, {
  Left: InputSlot,
  Field: InputField,
  Right: InputSlot,
});

export { Input, InputRoot, InputField, InputSlot, useInputContext };
export type { InputRootProps };
