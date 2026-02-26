import * as React from 'react';
import { View } from 'react-native';
import { Accordion as AccordionPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item ref={ref} className={cn('border-b border-border', className)} {...props} />
  );
});
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <TextClassContext.Provider value="text-sm font-medium">
        <AccordionPrimitive.Trigger
          ref={ref}
          className={cn(
            'flex flex-1 flex-row items-center justify-between py-4 font-medium web:transition-all web:hover:underline',
            className,
          )}
          {...props}
        >
          {children}
        </AccordionPrimitive.Trigger>
      </TextClassContext.Provider>
    </AccordionPrimitive.Header>
  );
});
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <TextClassContext.Provider value="text-sm">
      <AccordionPrimitive.Content
        ref={ref}
        className={cn('overflow-hidden text-sm web:transition-all', className)}
        {...props}
      >
        <View className="pb-4 pt-0">{children}</View>
      </AccordionPrimitive.Content>
    </TextClassContext.Provider>
  );
});
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
