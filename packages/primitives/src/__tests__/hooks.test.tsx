import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { Dimensions, type View } from 'react-native';
import { useControllableState, useRelativePosition } from '../hooks';
import { measureTrigger } from '../hooks/measure-trigger';

describe('useControllableState', () => {
  it('works in uncontrolled mode with defaultProp', () => {
    const { result } = renderHook(() =>
      useControllableState({ defaultProp: false })
    );
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });

  it('works in controlled mode with prop', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({ prop: true, onChange })
    );
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('calls onChange when uncontrolled value changes', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({ defaultProp: 'a', onChange })
    );

    act(() => result.current[1]('b'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not call onChange when value stays same', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({ defaultProp: 'a', onChange })
    );

    act(() => result.current[1]('a'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('useRelativePosition', () => {
  // A 1280x720 browser window on a 2560x1440 monitor.
  beforeEach(() => {
    vi.spyOn(Dimensions, 'get').mockImplementation((dim) =>
      dim === 'window'
        ? { width: 1280, height: 720, scale: 1, fontScale: 1 }
        : { width: 2560, height: 1440, scale: 1, fontScale: 1 }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const args = {
    side: 'bottom' as const,
    align: 'end' as const,
    sideOffset: 4,
    alignOffset: 0,
    avoidCollisions: true,
    contentLayout: { x: 0, y: 0, width: 256, height: 300 },
  };

  it('positions content absolutely beside its trigger', () => {
    const { result } = renderHook(() =>
      useRelativePosition({
        ...args,
        triggerPosition: { pageX: 1000, pageY: 100, width: 80, height: 40 },
      })
    );
    expect(result.current).toMatchObject({
      position: 'absolute',
      top: 144,
      left: 824,
    });
  });

  it('keeps content inside the web window, not the monitor', () => {
    const { result } = renderHook(() =>
      useRelativePosition({
        ...args,
        triggerPosition: { pageX: 1000, pageY: 600, width: 80, height: 40 },
      })
    );
    // 720 - 300; with the monitor's 1440 it would be 644.
    expect(result.current).toMatchObject({ position: 'absolute', top: 420 });
  });

  it("one content's position does not change another's", () => {
    const first = renderHook(() =>
      useRelativePosition({
        ...args,
        triggerPosition: { pageX: 1000, pageY: 100, width: 80, height: 40 },
      })
    );
    const second = renderHook(() =>
      useRelativePosition({
        ...args,
        triggerPosition: { pageX: 1000, pageY: 600, width: 80, height: 40 },
      })
    );
    expect(first.result.current).toMatchObject({
      position: 'absolute',
      top: 144,
      left: 824,
    });
    expect(second.result.current).toMatchObject({ top: 420 });
    expect(first.result.current).not.toBe(second.result.current);
  });

  it('is hidden until the trigger and content are measured', () => {
    const { result } = renderHook(() =>
      useRelativePosition({ ...args, triggerPosition: null })
    );
    expect(result.current).toMatchObject({
      opacity: 0,
      position: 'absolute',
    });
  });
});

describe('measureTrigger', () => {
  it('on web reads the trigger box from measureInWindow, not measure', () => {
    const measure = vi.fn();
    const node = {
      measure,
      measureInWindow: vi.fn((cb: (x: number, y: number, width: number, height: number) => void) =>
        cb(10, 20, 30, 40)
      ),
    } as unknown as View;
    const onMeasure = vi.fn();

    measureTrigger(node, onMeasure);

    expect(onMeasure).toHaveBeenCalledWith({ pageX: 10, pageY: 20, width: 30, height: 40 });
    expect(measure).not.toHaveBeenCalled();
  });
});
