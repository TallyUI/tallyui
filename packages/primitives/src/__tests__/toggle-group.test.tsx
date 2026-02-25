import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View } from 'react-native';
import * as ToggleGroup from '../toggle-group';

describe('ToggleGroup', () => {
  it('Root has role="group"', () => {
    render(
      <ToggleGroup.Root testID="group" type="single" onValueChange={vi.fn()}>
        <ToggleGroup.Item value="a" testID="item-a" />
      </ToggleGroup.Root>
    );
    expect(screen.getByTestId('group').getAttribute('role')).toBe('group');
  });

  it('Items have aria-pressed', () => {
    render(
      <ToggleGroup.Root type="single" value="a" onValueChange={vi.fn()}>
        <ToggleGroup.Item value="a" testID="item-a" />
        <ToggleGroup.Item value="b" testID="item-b" />
      </ToggleGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('false');
  });

  describe('single type', () => {
    it('selecting an item deselects the previous', () => {
      const onValueChange = vi.fn();
      const { rerender } = render(
        <ToggleGroup.Root type="single" value="a" onValueChange={onValueChange}>
          <ToggleGroup.Item value="a" testID="item-a" />
          <ToggleGroup.Item value="b" testID="item-b" />
        </ToggleGroup.Root>
      );
      fireEvent.click(screen.getByTestId('item-b'));
      expect(onValueChange).toHaveBeenCalledWith('b');

      rerender(
        <ToggleGroup.Root type="single" value="b" onValueChange={onValueChange}>
          <ToggleGroup.Item value="a" testID="item-a" />
          <ToggleGroup.Item value="b" testID="item-b" />
        </ToggleGroup.Root>
      );
      expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('false');
      expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('true');
    });

    it('re-pressing same item deselects it', () => {
      const onValueChange = vi.fn();
      render(
        <ToggleGroup.Root type="single" value="a" onValueChange={onValueChange}>
          <ToggleGroup.Item value="a" testID="item-a" />
        </ToggleGroup.Root>
      );
      fireEvent.click(screen.getByTestId('item-a'));
      expect(onValueChange).toHaveBeenCalledWith('');
    });
  });

  describe('multiple type', () => {
    it('multiple items can be selected', () => {
      const onValueChange = vi.fn();
      render(
        <ToggleGroup.Root type="multiple" value={['a']} onValueChange={onValueChange}>
          <ToggleGroup.Item value="a" testID="item-a" />
          <ToggleGroup.Item value="b" testID="item-b" />
        </ToggleGroup.Root>
      );
      expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(screen.getByTestId('item-b'));
      expect(onValueChange).toHaveBeenCalledWith(['a', 'b']);
    });

    it('re-pressing toggles off', () => {
      const onValueChange = vi.fn();
      render(
        <ToggleGroup.Root type="multiple" value={['a', 'b']} onValueChange={onValueChange}>
          <ToggleGroup.Item value="a" testID="item-a" />
          <ToggleGroup.Item value="b" testID="item-b" />
        </ToggleGroup.Root>
      );
      fireEvent.click(screen.getByTestId('item-a'));
      expect(onValueChange).toHaveBeenCalledWith(['b']);
    });
  });

  it('controlled mode (single)', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <ToggleGroup.Root type="single" value="a" onValueChange={onValueChange}>
        <ToggleGroup.Item value="a" testID="item-a" />
        <ToggleGroup.Item value="b" testID="item-b" />
      </ToggleGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('false');

    rerender(
      <ToggleGroup.Root type="single" value="b" onValueChange={onValueChange}>
        <ToggleGroup.Item value="a" testID="item-a" />
        <ToggleGroup.Item value="b" testID="item-b" />
      </ToggleGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('true');
  });

  it('controlled mode (multiple)', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <ToggleGroup.Root type="multiple" value={['a']} onValueChange={onValueChange}>
        <ToggleGroup.Item value="a" testID="item-a" />
        <ToggleGroup.Item value="b" testID="item-b" />
      </ToggleGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('false');

    rerender(
      <ToggleGroup.Root type="multiple" value={['a', 'b']} onValueChange={onValueChange}>
        <ToggleGroup.Item value="a" testID="item-a" />
        <ToggleGroup.Item value="b" testID="item-b" />
      </ToggleGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('true');
  });

  it('uncontrolled with defaultValue', () => {
    render(
      <ToggleGroup.Root type="single" defaultValue="b">
        <ToggleGroup.Item value="a" testID="item-a" />
        <ToggleGroup.Item value="b" testID="item-b" />
      </ToggleGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('item-b').getAttribute('aria-pressed')).toBe('true');
  });

  it('disabled prevents toggle', () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup.Root type="single" onValueChange={onValueChange} disabled>
        <ToggleGroup.Item value="a" testID="item-a" />
        <ToggleGroup.Item value="b" testID="item-b" />
      </ToggleGroup.Root>
    );
    fireEvent.click(screen.getByTestId('item-a'));
    fireEvent.click(screen.getByTestId('item-b'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('asChild works on Root', () => {
    render(
      <ToggleGroup.Root asChild type="single" onValueChange={vi.fn()}>
        <View testID="child">
          <ToggleGroup.Item value="a" />
        </View>
      </ToggleGroup.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('group');
  });
});
