import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

  describe('interaction', () => {
    function ControlledSlider({
      initial,
      onValueChange,
      ...props
    }: { initial: number; onValueChange?: (value: number) => void } & Omit<
      React.ComponentProps<typeof Slider.Root>,
      'value' | 'onValueChange'
    >) {
      const [value, setValue] = React.useState(initial);
      return (
        <Slider.Root
          testID="root"
          value={value}
          onValueChange={(next) => {
            onValueChange?.(next);
            setValue(next);
          }}
          {...props}
        >
          <Slider.Track>
            <Slider.Range testID="range" />
          </Slider.Track>
          <Slider.Thumb testID="thumb" />
        </Slider.Root>
      );
    }

    function mockRootRect() {
      vi.spyOn(screen.getByTestId('root'), 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 200,
        bottom: 20,
        width: 200,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    }

    const press = (el: Element, clientX: number) =>
      fireEvent.mouseDown(el, { clientX, button: 0, buttons: 1 });
    const move = (clientX: number) =>
      fireEvent.mouseMove(document, { clientX, buttons: 1 });
    const release = (clientX: number) => fireEvent.mouseUp(document, { clientX });

    it('drag sets the value from the pointer and stops on release', () => {
      const onValueChange = vi.fn();
      render(<ControlledSlider initial={50} onValueChange={onValueChange} />);
      mockRootRect();
      const thumb = screen.getByTestId('thumb');

      press(screen.getByTestId('root'), 50);
      expect(onValueChange).toHaveBeenLastCalledWith(25);
      expect(thumb.getAttribute('aria-valuenow')).toBe('25');

      move(150);
      expect(onValueChange).toHaveBeenLastCalledWith(75);
      expect(thumb.getAttribute('aria-valuenow')).toBe('75');

      release(150);
      move(20);
      expect(onValueChange).toHaveBeenCalledTimes(2);
      expect(thumb.getAttribute('aria-valuenow')).toBe('75');
    });

    it('arrow keys step the value and prevent the default', () => {
      const onValueChange = vi.fn();
      render(<ControlledSlider initial={50} onValueChange={onValueChange} />);
      const thumb = screen.getByTestId('thumb');

      expect(fireEvent.keyDown(thumb, { key: 'ArrowRight' })).toBe(false);
      expect(thumb.getAttribute('aria-valuenow')).toBe('51');
      expect(fireEvent.keyDown(thumb, { key: 'ArrowUp' })).toBe(false);
      expect(thumb.getAttribute('aria-valuenow')).toBe('52');
      expect(fireEvent.keyDown(thumb, { key: 'ArrowLeft' })).toBe(false);
      expect(thumb.getAttribute('aria-valuenow')).toBe('51');
      expect(fireEvent.keyDown(thumb, { key: 'ArrowDown' })).toBe(false);
      expect(thumb.getAttribute('aria-valuenow')).toBe('50');
      expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([51, 52, 51, 50]);
    });

    it('Home, End, PageUp and PageDown', () => {
      render(<ControlledSlider initial={50} min={10} max={90} step={5} />);
      const thumb = screen.getByTestId('thumb');

      fireEvent.keyDown(thumb, { key: 'Home' });
      expect(thumb.getAttribute('aria-valuenow')).toBe('10');
      fireEvent.keyDown(thumb, { key: 'PageUp' });
      expect(thumb.getAttribute('aria-valuenow')).toBe('60');
      fireEvent.keyDown(thumb, { key: 'PageUp' });
      expect(thumb.getAttribute('aria-valuenow')).toBe('90');
      fireEvent.keyDown(thumb, { key: 'PageDown' });
      expect(thumb.getAttribute('aria-valuenow')).toBe('40');
      fireEvent.keyDown(thumb, { key: 'End' });
      expect(thumb.getAttribute('aria-valuenow')).toBe('90');
    });

    it('drag snaps to the step', () => {
      const onValueChange = vi.fn();
      render(<ControlledSlider initial={0} step={25} onValueChange={onValueChange} />);
      mockRootRect();

      press(screen.getByTestId('thumb'), 80);
      expect(onValueChange).toHaveBeenCalledWith(50);
      move(500);
      expect(onValueChange).toHaveBeenLastCalledWith(100);
      release(500);
    });

    it('max off the step grid stays reachable', () => {
      render(<ControlledSlider initial={0} max={10} step={3} />);
      mockRootRect();
      const thumb = screen.getByTestId('thumb');

      fireEvent.keyDown(thumb, { key: 'End' });
      expect(thumb.getAttribute('aria-valuenow')).toBe('10');
      press(thumb, 20);
      expect(thumb.getAttribute('aria-valuenow')).toBe('0');
      move(200);
      expect(thumb.getAttribute('aria-valuenow')).toBe('10');
      release(200);
    });

    it('float steps have no float noise', () => {
      const onValueChange = vi.fn();
      render(<ControlledSlider initial={0.2} min={0} max={1} step={0.1} onValueChange={onValueChange} />);

      fireEvent.keyDown(screen.getByTestId('thumb'), { key: 'ArrowRight' });
      expect(onValueChange).toHaveBeenCalledWith(0.3);
    });

    it('disabled ignores pointer and keys', () => {
      const onValueChange = vi.fn();
      render(<ControlledSlider initial={50} disabled onValueChange={onValueChange} />);
      mockRootRect();
      const thumb = screen.getByTestId('thumb');

      press(screen.getByTestId('root'), 20);
      move(180);
      release(180);
      fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      expect(onValueChange).not.toHaveBeenCalled();
      expect(thumb.getAttribute('aria-valuenow')).toBe('50');
    });

    it('positions Range and Thumb at the value', () => {
      const { rerender } = render(
        <Slider.Root value={25} onValueChange={vi.fn()}>
          <Slider.Range testID="range" />
          <Slider.Thumb testID="thumb" />
        </Slider.Root>
      );
      expect(screen.getByTestId('range').style.width).toBe('25%');
      expect(screen.getByTestId('thumb').style.left).toBe('25%');
      expect(screen.getByTestId('thumb').style.position).toBe('absolute');

      rerender(
        <Slider.Root value={25} onValueChange={vi.fn()}>
          <Slider.Range testID="range" style={{ width: '60%' }} />
          <Slider.Thumb testID="thumb" style={{ left: '60%' }} />
        </Slider.Root>
      );
      expect(screen.getByTestId('range').style.width).toBe('60%');
      expect(screen.getByTestId('thumb').style.left).toBe('60%');
    });

    it("calls the caller's onKeyDown on the Thumb", () => {
      const onKeyDown = vi.fn();
      const onValueChange = vi.fn();
      render(
        <Slider.Root defaultValue={50} onValueChange={onValueChange}>
          <Slider.Thumb testID="thumb" onKeyDown={onKeyDown} />
        </Slider.Root>
      );
      const thumb = screen.getByTestId('thumb');

      fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      fireEvent.keyDown(thumb, { key: 'a' });
      expect(onKeyDown).toHaveBeenCalledTimes(2);
      expect(onValueChange).toHaveBeenCalledWith(51);
      expect(thumb.getAttribute('aria-valuenow')).toBe('51');
    });
  });
});
