import * as React from 'react';
import { View, Animated, Platform } from 'react-native';
import { AlertDialog as AlertDialogPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { useOverlayMotion, DIALOG_MOTION } from '../dialog/motion';

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(function AlertDialogOverlay({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-scrim', className)}
      {...props}
    />
  );
});
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(function AlertDialogContent({ className, children, ...props }, ref) {
  const { open } = AlertDialogPrimitive.useRootContext();
  const { mounted, scrim, panel } = useOverlayMotion(open, true, DIALOG_MOTION);
  if (!mounted) return null;
  const { style, ...propsWithoutStyle } = props;
  // WCPOS v2 dialog-in / dialog-out.
  return (
    <AlertDialogPortal forceMount>
      <Animated.View className="fixed inset-0 z-50" style={{ opacity: scrim }} pointerEvents={open ? 'auto' : 'none'}>
        <AlertDialogOverlay forceMount className="absolute inset-0" />
      </Animated.View>
      <AlertDialogPrimitive.Content
        forceMount asChild
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-background p-6 shadow-lg',
          className,
        )}
        {...propsWithoutStyle}
      >
        <Animated.View
          style={[style, { opacity: panel, transform: Platform.OS === 'web' ? [{ scale: panel.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] : undefined }]}
          pointerEvents={open ? 'auto' : 'none'}
        >
          {children}
        </Animated.View>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = 'AlertDialogContent';

function AlertDialogHeader({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
  return <View className={cn('flex flex-col gap-2', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
  return <View className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)} {...props} />;
}

const AlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <TextClassContext.Provider value="text-lg font-semibold text-foreground">
      <AlertDialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
    </TextClassContext.Provider>
  );
});
AlertDialogTitle.displayName = 'AlertDialogTitle';

const AlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
});
AlertDialogDescription.displayName = 'AlertDialogDescription';

const AlertDialogAction = AlertDialogPrimitive.Action;
const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
