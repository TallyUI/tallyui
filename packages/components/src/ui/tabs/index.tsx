import * as React from 'react';
import { Tabs as TabsPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { MinTargetBand } from '../../scale/min-target';

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex flex-row h-10 items-center justify-center rounded-md bg-muted p-1', className)}
      {...props}
    />
  );
}

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, children, ...props }, ref) {
  const { value } = TabsPrimitive.useRootContext();
  const isActive = props.value === value;

  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm font-medium',
        isActive ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium web:ring-offset-background web:transition-all web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
          isActive && 'bg-background shadow-sm',
          className,
        )}
        {...props}
      >
        {/* The band rides along after the label; asChild's Slot takes one child, so it keeps its own. */}
        {props.asChild ? children : (state) => (
          <>
            {typeof children === 'function' ? children(state) : children}
            <MinTargetBand />
          </>
        )}
      </TabsPrimitive.Trigger>
    </TextClassContext.Provider>
  );
});
TabsTrigger.displayName = 'TabsTrigger';

function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('mt-2 web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
