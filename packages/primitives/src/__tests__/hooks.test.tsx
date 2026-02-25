import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useControllableState } from '../hooks';

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
