import * as React from 'react';
import { Text, View, type TextProps, type ViewProps } from 'react-native';
import { TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Card = React.forwardRef<View, ViewProps>(function Card({ className, ...props }, ref) {
  return (
    <View
      ref={ref}
      className={cn('rounded-lg border border-border bg-card shadow-sm', className)}
      {...props}
    />
  );
});
Card.displayName = 'Card';

const CardHeader = React.forwardRef<View, ViewProps>(function CardHeader({ className, ...props }, ref) {
  return (
    <View ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  );
});
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<Text, TextProps>(function CardTitle({ className, ...props }, ref) {
  return (
    <Text
      ref={ref}
      role="heading"
      aria-level={3}
      className={cn('text-2xl font-semibold leading-none text-card-foreground', className)}
      {...props}
    />
  );
});
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<Text, TextProps>(function CardDescription({ className, ...props }, ref) {
  return (
    <Text ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
});
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<View, ViewProps>(function CardContent({ className, ...props }, ref) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View ref={ref} className={cn('p-6 pt-0', className)} {...props} />
    </TextClassContext.Provider>
  );
});
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<View, ViewProps>(function CardFooter({ className, ...props }, ref) {
  return (
    <View ref={ref} className={cn('flex flex-row items-center p-6 pt-0', className)} {...props} />
  );
});
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
