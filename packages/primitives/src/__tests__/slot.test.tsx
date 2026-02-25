import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View, Text, Pressable } from 'react-native';
import { Slot } from '../slot';

describe('Slot', () => {
  it('renders children directly', () => {
    render(<Slot><Text testID="child">Hello</Text></Slot>);
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('merges props onto child element', () => {
    render(
      <Slot testID="slot-test">
        <View><Text>Content</Text></View>
      </Slot>
    );
    expect(screen.getByTestId('slot-test')).toBeTruthy();
  });

  it('composes event handlers — both fire', () => {
    const slotHandler = vi.fn();
    const childHandler = vi.fn();

    render(
      <Slot onPress={slotHandler}>
        <Pressable testID="btn" onPress={childHandler}>
          <Text>Click</Text>
        </Pressable>
      </Slot>
    );

    fireEvent.click(screen.getByTestId('btn'));
    expect(slotHandler).toHaveBeenCalledTimes(1);
    expect(childHandler).toHaveBeenCalledTimes(1);
  });

  it('child props override slot props for non-handlers', () => {
    render(
      <Slot role="button">
        <View testID="el" role="dialog"><Text>Hi</Text></View>
      </Slot>
    );
    const el = screen.getByTestId('el');
    expect(el.getAttribute('role')).toBe('dialog');
  });

  it('throws on text-only children', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<Slot>plain text</Slot>);
    }).toThrow();
    spy.mockRestore();
  });
});
