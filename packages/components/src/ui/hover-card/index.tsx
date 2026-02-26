import * as React from 'react';
import { HoverCard as HoverCardPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(function HoverCardContent({ className, align = 'center', sideOffset = 4, ...props }, ref) {
  return (
    <HoverCardPrimitive.Portal>
      <TextClassContext.Provider value="text-popover-foreground">
        <HoverCardPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'z-50 w-64 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none',
            className,
          )}
          {...props}
        />
      </TextClassContext.Provider>
    </HoverCardPrimitive.Portal>
  );
});
HoverCardContent.displayName = 'HoverCardContent';

export { HoverCard, HoverCardTrigger, HoverCardContent };
