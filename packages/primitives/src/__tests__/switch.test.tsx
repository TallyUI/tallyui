import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View } from 'react-native';
import * as Switch from '../switch';

describe('Switch', () => {
  it('renders with role="switch"', () => {
    render(<Switch.Root testID="sw" checked={false} onCheckedChange={vi.fn()} />);
    expect(screen.getByTestId('sw').getAttribute('role')).toBe('switch');
  });

  it('toggles checked on click', () => {
    const onCheckedChange = vi.fn();
    render(<Switch.Root testID="sw" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByTestId('sw'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('controlled mode works', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Switch.Root testID="sw" checked={false} onCheckedChange={onCheckedChange} />
    );
    expect(screen.getByTestId('sw').getAttribute('aria-checked')).toBe('false');

    rerender(
      <Switch.Root testID="sw" checked={true} onCheckedChange={onCheckedChange} />
    );
    expect(screen.getByTestId('sw').getAttribute('aria-checked')).toBe('true');
  });

  it('uncontrolled with defaultChecked', () => {
    render(<Switch.Root testID="sw" defaultChecked={true} />);
    expect(screen.getByTestId('sw').getAttribute('aria-checked')).toBe('true');
  });

  it('disabled prevents toggle', () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch.Root testID="sw" checked={false} onCheckedChange={onCheckedChange} disabled />
    );
    fireEvent.click(screen.getByTestId('sw'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('aria-checked reflects state', () => {
    render(<Switch.Root testID="sw" checked={true} onCheckedChange={vi.fn()} />);
    expect(screen.getByTestId('sw').getAttribute('aria-checked')).toBe('true');
  });

  it('thumb renders inside root', () => {
    render(
      <Switch.Root testID="sw" checked={false} onCheckedChange={vi.fn()}>
        <Switch.Thumb testID="thumb" />
      </Switch.Root>
    );
    expect(screen.getByTestId('thumb')).toBeTruthy();
    expect(screen.getByTestId('thumb').getAttribute('role')).toBe('presentation');
  });

  it('asChild works on Root', () => {
    render(
      <Switch.Root asChild checked={false} onCheckedChange={vi.fn()}>
        <View testID="child" />
      </Switch.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('switch');
  });
});
