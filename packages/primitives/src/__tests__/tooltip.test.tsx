import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Pressable } from 'react-native';
import * as Tooltip from '../tooltip';
import { PortalHost } from '../portal';

// Under react-native-web in jsdom, a Pressable's onHoverIn/onHoverOut fire on pointerenter and
// pointerleave (jsdom has PointerEvent, so RNW listens for those, not mouseenter/mouseover).
const hover = (el: HTMLElement) => fireEvent.pointerEnter(el);
const leave = (el: HTMLElement) => fireEvent.pointerLeave(el);
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('Tooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const renderTooltip = (
    props: Partial<React.ComponentProps<typeof Tooltip.Root>> = {},
    triggerProps: Partial<React.ComponentProps<typeof Tooltip.Trigger>> = {}
  ) =>
    render(
      <div>
        <PortalHost />
        <Tooltip.Root {...props}>
          <Tooltip.Trigger testID="trigger" {...triggerProps}>
            Hover me
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Overlay testID="overlay" />
            <Tooltip.Content testID="content">Tooltip text</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );

  it('content has tooltip role', () => {
    renderTooltip({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('tooltip');
  });

  it('hover opens after delayDuration, not before', () => {
    vi.useFakeTimers();
    renderTooltip({ delayDuration: 300 });
    hover(screen.getByTestId('trigger'));
    advance(299);
    expect(screen.queryByTestId('content')).toBeNull();
    advance(1);
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('leaving before the delay cancels it; leaving an open tooltip closes it', () => {
    vi.useFakeTimers();
    renderTooltip({ delayDuration: 300 });
    const trigger = screen.getByTestId('trigger');
    hover(trigger);
    advance(100);
    leave(trigger);
    advance(1000);
    expect(screen.queryByTestId('content')).toBeNull();

    hover(trigger);
    advance(300);
    expect(screen.getByTestId('content')).toBeTruthy();
    leave(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('hover opens at once when delayDuration is omitted', () => {
    renderTooltip();
    hover(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('a press does not open the tooltip and calls the trigger onPress once', () => {
    const onPress = vi.fn();
    renderTooltip({}, { onPress });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.queryByTestId('content')).toBeNull();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a press closes an open tooltip', () => {
    renderTooltip({ defaultOpen: true });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('openOnPress: a press opens it and a second press closes it', () => {
    renderTooltip({}, { openOnPress: true });
    const trigger = screen.getByTestId('trigger');
    fireEvent.click(trigger);
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('focus opens it and blur closes it', () => {
    renderTooltip();
    const trigger = screen.getByTestId('trigger');
    fireEvent.focus(trigger);
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.blur(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('the focus a mouse press causes never opens it', () => {
    renderTooltip();
    const trigger = screen.getByTestId('trigger');
    // The order a browser sends for a click; react-native-web fires onPressIn only after focus.
    fireEvent.pointerDown(trigger, { button: 0, buttons: 1 });
    fireEvent.mouseDown(trigger, { button: 0, buttons: 1 });
    fireEvent.focus(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
    fireEvent.pointerUp(trigger, { button: 0 });
    fireEvent.mouseUp(trigger, { button: 0 });
    expect(screen.queryByTestId('content')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
    // The press is over, so a later keyboard focus opens it again.
    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('a blur clears a press that never ended, so the next focus opens it', () => {
    renderTooltip();
    const trigger = screen.getByTestId('trigger');
    fireEvent.pointerDown(trigger, { button: 0, buttons: 1 });
    fireEvent.focus(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('a slow press still calls onPress once and leaves the tooltip closed', () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    renderTooltip({}, { onPress });
    const trigger = screen.getByTestId('trigger');
    const touch = { identifier: 1, target: trigger, pageX: 0, pageY: 0, clientX: 0, clientY: 0 };
    fireEvent.touchStart(trigger, { touches: [touch], changedTouches: [touch] });
    advance(600);
    // react-native-web calls onPress from the click that follows touchend, as a browser sends it.
    fireEvent.touchEnd(trigger, { touches: [], changedTouches: [touch] });
    fireEvent.click(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('disabled: hover and focus do not open it', () => {
    renderTooltip({}, { disabled: true });
    const trigger = screen.getByTestId('trigger');
    hover(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
    fireEvent.focus(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled mode: a hover calls onOpenChange(true)', () => {
    const onOpenChange = vi.fn();
    renderTooltip({ open: false, onOpenChange });
    hover(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it("calls the caller's onHoverIn and onFocus", () => {
    const onHoverIn = vi.fn();
    const onFocus = vi.fn();
    renderTooltip({}, { onHoverIn, onFocus });
    const trigger = screen.getByTestId('trigger');
    hover(trigger);
    fireEvent.focus(trigger);
    expect(onHoverIn).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("asChild: hovering the child opens it, and the child's onPress still runs", () => {
    const childPress = vi.fn();
    render(
      <div>
        <PortalHost />
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Pressable testID="child" onPress={childPress} />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content testID="content">Tooltip text</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );
    const child = screen.getByTestId('child');
    hover(child);
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.click(child);
    expect(childPress).toHaveBeenCalledTimes(1);
  });

  it('unmounting during the delay never calls onOpenChange afterwards', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { unmount } = renderTooltip({ open: false, onOpenChange, delayDuration: 300 });
    hover(screen.getByTestId('trigger'));
    unmount();
    advance(1000);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('supports uncontrolled with defaultOpen', () => {
    renderTooltip({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('content not rendered when closed', () => {
    renderTooltip();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('trigger has button role', () => {
    renderTooltip();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('button');
  });

  it('asChild works on trigger', () => {
    render(
      <div>
        <PortalHost />
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div data-testid="custom-trigger">Custom</div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content testID="content">Tooltip text</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );
    const trigger = screen.getByTestId('custom-trigger');
    expect(trigger.getAttribute('role')).toBe('button');
  });
});
