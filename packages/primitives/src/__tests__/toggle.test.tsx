import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View } from 'react-native';
import * as Toggle from '../toggle';

describe('Toggle', () => {
  it('renders with role="button"', () => {
    render(<Toggle.Root testID="toggle" />);
    expect(screen.getByTestId('toggle').getAttribute('role')).toBe('button');
  });

  it('sets aria-pressed', () => {
    render(<Toggle.Root testID="toggle" pressed={true} onPressedChange={vi.fn()} />);
    expect(screen.getByTestId('toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles pressed on click', () => {
    const onPressedChange = vi.fn();
    render(<Toggle.Root testID="toggle" pressed={false} onPressedChange={onPressedChange} />);
    fireEvent.click(screen.getByTestId('toggle'));
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it('controlled mode works', () => {
    const onPressedChange = vi.fn();
    const { rerender } = render(
      <Toggle.Root testID="toggle" pressed={false} onPressedChange={onPressedChange} />
    );
    expect(screen.getByTestId('toggle').getAttribute('aria-pressed')).toBe('false');

    rerender(
      <Toggle.Root testID="toggle" pressed={true} onPressedChange={onPressedChange} />
    );
    expect(screen.getByTestId('toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('uncontrolled with defaultPressed', () => {
    render(<Toggle.Root testID="toggle" defaultPressed={true} />);
    expect(screen.getByTestId('toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('disabled prevents toggle', () => {
    const onPressedChange = vi.fn();
    render(
      <Toggle.Root testID="toggle" pressed={false} onPressedChange={onPressedChange} disabled />
    );
    fireEvent.click(screen.getByTestId('toggle'));
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('asChild works on Root', () => {
    render(
      <Toggle.Root asChild pressed={false} onPressedChange={vi.fn()}>
        <View testID="child" />
      </Toggle.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('button');
  });
});
