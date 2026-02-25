import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View } from 'react-native';
import * as RadioGroup from '../radio-group';

describe('RadioGroup', () => {
  it('Root has role="radiogroup"', () => {
    render(
      <RadioGroup.Root testID="group" onValueChange={vi.fn()}>
        <RadioGroup.Item value="a" testID="item-a" />
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('group').getAttribute('role')).toBe('radiogroup');
  });

  it('Items have role="radio"', () => {
    render(
      <RadioGroup.Root onValueChange={vi.fn()}>
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('role')).toBe('radio');
    expect(screen.getByTestId('item-b').getAttribute('role')).toBe('radio');
  });

  it('selecting an item updates value', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup.Root onValueChange={onValueChange}>
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    fireEvent.click(screen.getByTestId('item-a'));
    expect(onValueChange).toHaveBeenCalledWith('a');
  });

  it('controlled mode works', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <RadioGroup.Root value="a" onValueChange={onValueChange}>
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('item-b').getAttribute('aria-checked')).toBe('false');

    rerender(
      <RadioGroup.Root value="b" onValueChange={onValueChange}>
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('item-b').getAttribute('aria-checked')).toBe('true');
  });

  it('uncontrolled with defaultValue', () => {
    render(
      <RadioGroup.Root defaultValue="b">
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('item-b').getAttribute('aria-checked')).toBe('true');
  });

  it('only one item can be selected', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <RadioGroup.Root value="a" onValueChange={onValueChange}>
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('item-b').getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByTestId('item-b'));
    expect(onValueChange).toHaveBeenCalledWith('b');

    rerender(
      <RadioGroup.Root value="b" onValueChange={onValueChange}>
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('item-a').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('item-b').getAttribute('aria-checked')).toBe('true');
  });

  it('indicator visible only for checked item', () => {
    render(
      <RadioGroup.Root value="a" onValueChange={vi.fn()}>
        <RadioGroup.Item value="a" testID="item-a">
          <RadioGroup.Indicator testID="indicator-a" />
        </RadioGroup.Item>
        <RadioGroup.Item value="b" testID="item-b">
          <RadioGroup.Indicator testID="indicator-b" />
        </RadioGroup.Item>
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('indicator-a')).toBeTruthy();
    expect(screen.queryByTestId('indicator-b')).toBeNull();
  });

  it('indicator with forceMount always visible', () => {
    render(
      <RadioGroup.Root value="a" onValueChange={vi.fn()}>
        <RadioGroup.Item value="a" testID="item-a">
          <RadioGroup.Indicator testID="indicator-a" forceMount />
        </RadioGroup.Item>
        <RadioGroup.Item value="b" testID="item-b">
          <RadioGroup.Indicator testID="indicator-b" forceMount />
        </RadioGroup.Item>
      </RadioGroup.Root>
    );
    expect(screen.getByTestId('indicator-a')).toBeTruthy();
    expect(screen.getByTestId('indicator-b')).toBeTruthy();
  });

  it('disabled root prevents all items from toggling', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup.Root onValueChange={onValueChange} disabled>
        <RadioGroup.Item value="a" testID="item-a" />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    fireEvent.click(screen.getByTestId('item-a'));
    fireEvent.click(screen.getByTestId('item-b'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('disabled individual item prevents that item from toggling', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup.Root onValueChange={onValueChange}>
        <RadioGroup.Item value="a" testID="item-a" disabled />
        <RadioGroup.Item value="b" testID="item-b" />
      </RadioGroup.Root>
    );
    fireEvent.click(screen.getByTestId('item-a'));
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('item-b'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('asChild works on Root', () => {
    render(
      <RadioGroup.Root asChild onValueChange={vi.fn()}>
        <View testID="child">
          <RadioGroup.Item value="a" />
        </View>
      </RadioGroup.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('radiogroup');
  });
});
