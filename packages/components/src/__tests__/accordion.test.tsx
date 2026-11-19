import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { EASE, TIMING_EASE } from '../lib/motion';
import { cn } from '@tallyui/theme';

type Done = (result: { finished: boolean }) => void;
let held: Done[] = [];
const animation = () => ({
  start: (cb?: Done) => { if (cb) held.push(cb); },
  stop() {},
  reset() {},
}) as unknown as Animated.CompositeAnimation;

function Harness({ open = false, forceMount, ...trigger }: {
  open?: boolean; forceMount?: true; chevronPosition?: 'left' | 'right'; headerClassName?: string;
}) {
  return (
    <Accordion type="single" collapsible defaultValue={open ? 'a' : undefined}>
      <AccordionItem value="a">
        <AccordionTrigger testID="trigger" {...trigger}><Text>Label</Text></AccordionTrigger>
        <AccordionContent forceMount={forceMount}><Text>Body</Text></AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

const chevron = () => screen.getByTestId('trigger').querySelector('svg')!.closest('[aria-hidden="true"]:not(svg)') as HTMLElement;
const region = () => screen.queryByRole('region', { hidden: true });
const toggle = () => act(() => { fireEvent.click(screen.getByTestId('trigger')); });
const called = (config: object) => expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(config));
// react-native-web keeps a View's onLayout on its node (useElementLayout); jsdom has no ResizeObserver to call it.
function layout(height: number) {
  const inner = screen.getByText('Body').parentElement as HTMLElement & { __reactLayoutHandler: (event: unknown) => void };
  act(() => inner.__reactLayoutHandler({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } }));
}
const settle = () => act(async () => {});
// jsdom renders no NativeWind classes: read the className the nearest View above a host node was rendered with.
function renderedClassName(node: Element) {
  const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'))!;
  type Fiber = { type?: unknown; memoizedProps?: { className?: string }; return?: Fiber };
  let fiber = (node as unknown as Record<string, Fiber>)[key];
  while (fiber && (typeof fiber.type === 'string' || fiber.memoizedProps?.className === undefined)) fiber = fiber.return!;
  return fiber.memoizedProps?.className;
}
function OpenContent({ className }: { className?: string }) {
  return (
    <Accordion type="single" collapsible defaultValue="a">
      <AccordionItem value="a">
        <AccordionTrigger testID="trigger"><Text>Label</Text></AccordionTrigger>
        <AccordionContent className={className}><Text>Body</Text></AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
const innerClassName = () => renderedClassName(screen.getByText('Body').parentElement!);
const reduceMotion = (reduced: boolean) => vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);

describe('Accordion', () => {
  beforeEach(() => {
    held = [];
    reduceMotion(false);
    vi.spyOn(Animated, 'timing').mockImplementation(animation);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("draws v2's down chevron after the label by default", async () => {
    render(<Harness />);
    await settle();
    const svg = screen.getByTestId('trigger').querySelector('svg')!;
    expect(svg.querySelector('polyline')?.getAttribute('points')).toBe('6 9 12 15 18 9');
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('height')).toBe('18');
    expect(svg.getAttribute('stroke-width')).toBe('1.5');
    expect(screen.getByText('Label').compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws the chevron before the label with chevronPosition left', async () => {
    render(<Harness chevronPosition="left" />);
    await settle();
    const svg = screen.getByTestId('trigger').querySelector('svg')!;
    expect(screen.getByText('Label').compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('draws no chevron under asChild, whose one child owns the content', async () => {
    const { container } = render(
      <Accordion type="single">
        <AccordionItem value="a">
          <AccordionTrigger asChild><Text testID="own">Own trigger</Text></AccordionTrigger>
        </AccordionItem>
      </Accordion>,
    );
    await settle();
    expect(screen.getByTestId('own')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('puts headerClassName on the header', async () => {
    render(<Harness headerClassName="flex-1" />);
    await settle();
    const header = screen.getByRole('heading');
    expect(header.contains(screen.getByTestId('trigger'))).toBe(true);
    // jsdom renders no NativeWind classes, so read the className the heading's element was rendered with.
    const key = Object.keys(header).find((name) => name.startsWith('__reactFiber$'))!;
    type Fiber = { type?: unknown; memoizedProps?: { className?: string }; return?: Fiber };
    let fiber = (header as unknown as Record<string, Fiber>)[key];
    // Skip the host div (react-native-web's own css-view class) up to the View it came from.
    while (fiber && (typeof fiber.type === 'string' || fiber.memoizedProps?.className === undefined)) fiber = fiber.return!;
    expect(fiber.memoizedProps?.className).toBe('flex flex-1');
  });

  it('turns the chevron to 180deg over 250ms when it opens and back over 200ms when it closes', async () => {
    render(<Harness />);
    await settle();
    toggle();
    called({ toValue: 1, duration: 250, easing: TIMING_EASE });
    toggle();
    called({ toValue: 0, duration: 200, easing: TIMING_EASE });
  });

  it('an item that mounts open shows its chevron turned, with no animation', async () => {
    render(<Harness open />);
    await settle();
    expect(getComputedStyle(chevron()).transform).toBe('rotate(180deg)');
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it("folds open over 200ms on v2's ease once the content is measured", async () => {
    render(<Harness />);
    await settle();
    toggle();
    expect(Animated.timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ easing: EASE }));
    layout(48);
    called({ toValue: 48, duration: 200, easing: EASE, useNativeDriver: false });
  });

  it('folds shut over 200ms and unmounts only when the fold ends', async () => {
    render(<Harness open />);
    await settle();
    layout(48);
    toggle();
    called({ toValue: 0, duration: 200, easing: EASE, useNativeDriver: false });
    expect(region()).not.toBeNull();
    expect(screen.getByText('Body')).toBeTruthy();
    // Only the fold passes an end callback; the chevron turn does not.
    expect(held).toHaveLength(1);
    act(() => held[0]({ finished: true }));
    expect(region()).toBeNull();
  });

  it('reduced motion: the chevron and the fold are instant', async () => {
    reduceMotion(true);
    render(<Harness />);
    await settle();
    toggle();
    layout(48);
    expect(getComputedStyle(chevron()).transform).toBe('rotate(180deg)');
    expect(screen.getByText('Body')).toBeTruthy();
    toggle();
    expect(region()).toBeNull();
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('puts className on the inner padded view, as v2 does', async () => {
    render(<OpenContent className="pb-0 bg-muted" />);
    await settle();
    expect(innerClassName()).toBe(cn('pb-4 pt-0', 'pb-0 bg-muted'));
    expect(innerClassName()).not.toContain('pb-4');
  });

  it("keeps the outer content's classes fixed", async () => {
    render(<OpenContent className="pb-0 bg-muted" />);
    await settle();
    expect(renderedClassName(region()!)).toBe('overflow-hidden text-sm web:transition-all');
  });

  it('without className the inner view keeps pb-4 pt-0', async () => {
    render(<OpenContent />);
    await settle();
    expect(innerClassName()).toBe('pb-4 pt-0');
  });

  it('forceMount content does not fold', async () => {
    render(<Harness open forceMount />);
    await settle();
    layout(48);
    toggle();
    expect(screen.getByText('Body')).toBeTruthy();
    toggle();
    layout(48);
    expect(Animated.timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ easing: EASE }));
    expect(region()).not.toBeNull();
  });
});
