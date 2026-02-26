import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const ContextMenuContent = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(function ContextMenuContent({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        ref={ref}
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
});
ContextMenuContent.displayName = 'ContextMenuContent';

const ContextMenuItem = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { inset?: boolean }
>(function ContextMenuItem({ className, inset, ...props }, ref) {
  return (
    <TextClassContext.Provider value="select-none text-sm">
      <ContextMenuPrimitive.Item
        ref={ref}
        className={cn(
          'relative flex cursor-default select-none flex-row items-center rounded-sm px-2 py-1.5 text-sm outline-none web:focus:bg-accent web:focus:text-accent-foreground',
          inset && 'pl-8',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
});
ContextMenuItem.displayName = 'ContextMenuItem';

const ContextMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(function ContextMenuCheckboxItem({ className, children, checked, ...props }, ref) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      className={cn(
        'relative flex cursor-default select-none flex-row items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none web:focus:bg-accent web:focus:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
});
ContextMenuCheckboxItem.displayName = 'ContextMenuCheckboxItem';

const ContextMenuRadioItem = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(function ContextMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none flex-row items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none web:focus:bg-accent web:focus:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
});
ContextMenuRadioItem.displayName = 'ContextMenuRadioItem';

const ContextMenuLabel = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & { inset?: boolean }
>(function ContextMenuLabel({ className, inset, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)}
      {...props}
    />
  );
});
ContextMenuLabel.displayName = 'ContextMenuLabel';

const ContextMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function ContextMenuSeparator({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
  );
});
ContextMenuSeparator.displayName = 'ContextMenuSeparator';

const ContextMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & { inset?: boolean }
>(function ContextMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <TextClassContext.Provider value="select-none text-sm">
      <ContextMenuPrimitive.SubTrigger
        ref={ref}
        className={cn(
          'flex cursor-default select-none flex-row items-center rounded-sm px-2 py-1.5 text-sm outline-none web:focus:bg-accent',
          inset && 'pl-8',
          className,
        )}
        {...props}
      >
        {children}
      </ContextMenuPrimitive.SubTrigger>
    </TextClassContext.Provider>
  );
});
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger';

const ContextMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(function ContextMenuSubContent({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.SubContent
      ref={ref}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg',
        className,
      )}
      {...props}
    />
  );
});
ContextMenuSubContent.displayName = 'ContextMenuSubContent';

export {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuCheckboxItem, ContextMenuRadioItem, ContextMenuLabel,
  ContextMenuSeparator, ContextMenuGroup, ContextMenuPortal,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
