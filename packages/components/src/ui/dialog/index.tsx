import * as React from 'react';
import { View, Text, Pressable, Animated, Dimensions } from 'react-native';
import { Dialog as DialogPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { useSheetMotion } from './motion';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-scrim', className)}
      {...props}
    />
  );
});
DialogOverlay.displayName = 'DialogOverlay';

/** Where the content sits: centred (the default), or a full-height sheet on the left or right edge, full width on a phone. */
const SIDE_CLASS = {
  center: 'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-background p-6 shadow-lg',
  left: 'fixed left-0 top-0 bottom-0 z-50 h-full w-full max-w-lg gap-4 rounded-none border-r border-border bg-background p-6 shadow-lg',
  right: 'fixed right-0 top-0 bottom-0 z-50 h-full w-full max-w-lg gap-4 rounded-none border-l border-border bg-background p-6 shadow-lg',
} as const;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: keyof typeof SIDE_CLASS }
>(function DialogContent({ className, children, side = 'center', ...props }, ref) {
  const { open } = DialogPrimitive.useRootContext();
  const { mounted, scrim, panel } = useSheetMotion(open, side === 'right');
  const [width, setWidth] = React.useState(() => Dimensions.get('window').width);

  // WCPOS v2 panel-in-right / panel-out-right; the centred dialog follows in a later job.
  if (side === 'right') {
    if (!mounted) return null;
    const { style, ...propsWithoutStyle } = props;
    return (
      <DialogPortal forceMount>
        <Animated.View className="fixed inset-0 z-50" style={{ opacity: scrim }} pointerEvents={open ? 'auto' : 'none'}>
          <DialogOverlay forceMount className="absolute inset-0" />
        </Animated.View>
        <DialogPrimitive.Content forceMount asChild ref={ref} className={cn(SIDE_CLASS.right, className)} {...propsWithoutStyle}>
          <Animated.View
            style={[style, { transform: [{ translateX: panel.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] }]}
            pointerEvents={open ? 'auto' : 'none'}
            onLayout={(e) => { if (e.nativeEvent.layout.width) setWidth(e.nativeEvent.layout.width); }}
          >
            {children}
          </Animated.View>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(SIDE_CLASS[side], className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
  return (
    <View className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
  );
}

function DialogFooter({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
  return (
    <View className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)} {...props} />
  );
}

const TITLE_CLASS = 'text-lg font-semibold leading-none text-foreground';

/** tailwind-merge drops `leading-none` when a caller passes a text size; put it back unless the caller set a leading. */
function titleClass(className?: string) {
  const merged = cn(TITLE_CLASS, className);
  return /\bleading-/.test(merged) ? merged : `${merged} leading-none`;
}

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  const merged = titleClass(className);
  return (
    <TextClassContext.Provider value={merged}>
      <DialogPrimitive.Title ref={ref} className={merged} {...props} />
    </TextClassContext.Provider>
  );
});
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
});
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
