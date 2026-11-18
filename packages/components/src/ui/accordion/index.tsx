import * as React from 'react';
import { Animated, Platform, View } from 'react-native';
import { Accordion as AccordionPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { ChevronDownIcon } from '../icon/chevron-down-icon';
import { CROSSFADE, EASE, TIMING_EASE } from '../../lib/motion';
import { useReducedMotion } from '../../lib/use-reduced-motion';

// WCPOS v2 packages/components/src/accordion/index.tsx:65: the chevron turns over 250ms opening, 200ms closing.
const TURN_OPEN_MS = 250;
const TURN_CLOSE_MS = 200;

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

/** v2's down chevron, turned 180deg (and dimmed to 0.8) while its item is open. */
function AccordionChevron() {
  const { isExpanded } = AccordionPrimitive.useItemContext();
  const reduced = useReducedMotion();
  const turn = React.useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const shown = React.useRef(isExpanded);
  React.useEffect(() => {
    if (shown.current === isExpanded) return;
    shown.current = isExpanded;
    turn.stopAnimation();
    if (reduced !== false) return turn.setValue(isExpanded ? 1 : 0);
    Animated.timing(turn, { toValue: isExpanded ? 1 : 0, duration: isExpanded ? TURN_OPEN_MS : TURN_CLOSE_MS,
      easing: TIMING_EASE, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [isExpanded, reduced, turn]);
  React.useEffect(() => () => turn.stopAnimation(), [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const opacity = turn.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] });
  return (
    <Animated.View aria-hidden className="shrink-0 text-foreground" style={{ opacity, transform: [{ rotate }] }}>
      <ChevronDownIcon size={18} strokeWidth={1.5} />
    </Animated.View>
  );
}

type AccordionTriggerProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
  /** Which side of the label the chevron sits on, as in v2; defaults to the right. */
  chevronPosition?: 'left' | 'right';
  /** Classes for the outer AccordionPrimitive.Header wrapper, merged after `flex` (useful for flex sizing). */
  headerClassName?: string;
};

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(function AccordionTrigger({ className, children, chevronPosition = 'right', headerClassName, ...props }, ref) {
  // Under asChild the one slotted child draws its own content, as in SelectTrigger.
  const draw = (label: React.ReactNode) =>
    <>{chevronPosition === 'left' && <AccordionChevron />}{label}{chevronPosition === 'right' && <AccordionChevron />}</>;
  return (
    <AccordionPrimitive.Header className={cn('flex', headerClassName)}>
      <TextClassContext.Provider value="text-sm font-medium">
        <AccordionPrimitive.Trigger
          ref={ref}
          className={cn(
            'flex flex-1 flex-row items-center justify-between py-4 font-medium web:transition-all web:hover:underline',
            className,
          )}
          {...props}
        >
          {props.asChild ? children : typeof children === 'function' ? (state) => draw(children(state)) : draw(children)}
        </AccordionPrimitive.Trigger>
      </TextClassContext.Provider>
    </AccordionPrimitive.Header>
  );
});
AccordionTrigger.displayName = 'AccordionTrigger';

type Fold = 'idle' | 'opening' | 'closing';

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, forceMount, ...props }, ref) {
  const { isExpanded } = AccordionPrimitive.useItemContext();
  const still = useReducedMotion() !== false;
  const height = React.useRef(new Animated.Value(0)).current;
  const measured = React.useRef(0);
  const waiting = React.useRef(false);
  // Only a change of isExpanded after mount folds; `from` is the phase that change interrupted.
  const [fold, setFold] = React.useState<{ open: boolean; phase: Fold; from: Fold }>(
    { open: isExpanded, phase: 'idle', from: 'idle' });
  if (fold.open !== isExpanded) {
    const phase = forceMount || still ? 'idle' : isExpanded ? 'opening' : 'closing';
    setFold({ open: isExpanded, phase, from: fold.phase });
  }
  const run = React.useCallback((toValue: number) => {
    Animated.timing(height, { toValue, duration: CROSSFADE, easing: EASE, useNativeDriver: false })
      .start(({ finished }) => finished && setFold((f) => ({ ...f, phase: 'idle' })));
  }, [height]);
  React.useLayoutEffect(() => {
    if (fold.phase === 'idle') return;
    height.stopAnimation();
    waiting.current = false;
    if (fold.phase === 'opening') {
      // Reopened mid-close: still mounted and measured. Otherwise wait for the fresh content's layout.
      if (fold.from === 'closing') run(measured.current);
      else { height.setValue(0); waiting.current = true; }
    } else if (measured.current <= 0) setFold((f) => ({ ...f, phase: 'idle' }));
    else { if (fold.from === 'idle') height.setValue(measured.current); run(0); }
  }, [fold, height, run]);
  React.useEffect(() => () => height.stopAnimation(), [height]);
  const onLayout = (h: number) => {
    measured.current = h;
    if (waiting.current) { waiting.current = false; if (h > 0) run(h); else setFold((f) => ({ ...f, phase: 'idle' })); }
  };
  return (
    <TextClassContext.Provider value="text-sm">
      <AccordionPrimitive.Content
        ref={ref}
        className="overflow-hidden text-sm web:transition-all"
        forceMount={forceMount || fold.phase === 'closing' ? true : undefined}
        {...props}
      >
        <Animated.View style={fold.phase === 'idle' ? undefined : { height, overflow: 'hidden' }}>
          <View className={cn('pb-4 pt-0', className)} onLayout={(e) => onLayout(e.nativeEvent.layout.height)}>{children}</View>
        </Animated.View>
      </AccordionPrimitive.Content>
    </TextClassContext.Provider>
  );
});
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
