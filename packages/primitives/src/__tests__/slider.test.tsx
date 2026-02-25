import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View } from 'react-native';
import * as Slider from '../slider';

describe('Slider', () => {
  it('Root has role="group"', () => {
    render(<Slider.Root testID="root" />);
    expect(screen.getByTestId('root').getAttribute('role')).toBe('group');
  });

  it('Thumb has role="slider"', () => {
    render(
      <Slider.Root>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    expect(screen.getByTestId('thumb').getAttribute('role')).toBe('slider');
  });

  it('Thumb has aria-valuemin, aria-valuemax, aria-valuenow', () => {
    render(
      <Slider.Root value={50} onValueChange={vi.fn()}>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    const thumb = screen.getByTestId('thumb');
    expect(thumb.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb.getAttribute('aria-valuemax')).toBe('100');
    expect(thumb.getAttribute('aria-valuenow')).toBe('50');
  });

  it('default min=0, max=100', () => {
    render(
      <Slider.Root>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    const thumb = screen.getByTestId('thumb');
    expect(thumb.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb.getAttribute('aria-valuemax')).toBe('100');
  });

  it('custom min/max/step', () => {
    render(
      <Slider.Root min={10} max={200} step={5} value={50} onValueChange={vi.fn()}>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    const thumb = screen.getByTestId('thumb');
    expect(thumb.getAttribute('aria-valuemin')).toBe('10');
    expect(thumb.getAttribute('aria-valuemax')).toBe('200');
    expect(thumb.getAttribute('aria-valuenow')).toBe('50');
  });

  it('controlled mode', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Slider.Root value={25} onValueChange={onValueChange}>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    expect(screen.getByTestId('thumb').getAttribute('aria-valuenow')).toBe('25');

    rerender(
      <Slider.Root value={75} onValueChange={onValueChange}>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    expect(screen.getByTestId('thumb').getAttribute('aria-valuenow')).toBe('75');
  });

  it('uncontrolled with defaultValue', () => {
    render(
      <Slider.Root defaultValue={42}>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    expect(screen.getByTestId('thumb').getAttribute('aria-valuenow')).toBe('42');
  });

  it('disabled sets aria-disabled on thumb', () => {
    render(
      <Slider.Root disabled>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    expect(screen.getByTestId('thumb').getAttribute('aria-disabled')).toBe('true');
  });

  it('not disabled omits aria-disabled on thumb', () => {
    render(
      <Slider.Root>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    expect(screen.getByTestId('thumb').getAttribute('aria-disabled')).toBeNull();
  });

  it('Track and Range render inside Root', () => {
    render(
      <Slider.Root testID="root">
        <Slider.Track testID="track">
          <Slider.Range testID="range" />
        </Slider.Track>
        <Slider.Thumb testID="thumb" />
      </Slider.Root>
    );
    expect(screen.getByTestId('root')).toBeTruthy();
    expect(screen.getByTestId('track')).toBeTruthy();
    expect(screen.getByTestId('range')).toBeTruthy();
    expect(screen.getByTestId('thumb')).toBeTruthy();
  });

  it('asChild works on Root', () => {
    render(
      <Slider.Root asChild>
        <View testID="child" />
      </Slider.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('group');
  });
});
