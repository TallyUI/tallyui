import * as React from 'react';
import { Collapsible as CollapsiblePrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

const CollapsibleContent = React.forwardRef<
  React.ComponentRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(function CollapsibleContent({ className, ...props }, ref) {
  return (
    <TextClassContext.Provider value="text-sm">
      <CollapsiblePrimitive.Content
        ref={ref}
        className={cn('overflow-hidden web:transition-all', className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
});
CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
