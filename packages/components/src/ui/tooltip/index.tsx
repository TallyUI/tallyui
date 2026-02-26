import * as React from 'react';
import { Tooltip as TooltipPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TextClassContext.Provider value="text-sm text-popover-foreground">
        <TooltipPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          className={cn(
            'z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md',
            className,
          )}
          {...props}
        />
      </TextClassContext.Provider>
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent };
