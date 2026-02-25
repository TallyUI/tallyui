import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View } from 'react-native';
import * as Checkbox from '../checkbox';

describe('Checkbox', () => {
  it('renders with role="checkbox"', () => {
    render(<Checkbox.Root testID="cb" checked={false} onCheckedChange={vi.fn()} />);
    expect(screen.getByTestId('cb').getAttribute('role')).toBe('checkbox');
  });

  it('toggles checked on click', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox.Root testID="cb" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByTestId('cb'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('controlled mode works', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Checkbox.Root testID="cb" checked={false} onCheckedChange={onCheckedChange} />
    );
    expect(screen.getByTestId('cb').getAttribute('aria-checked')).toBe('false');

    rerender(
      <Checkbox.Root testID="cb" checked={true} onCheckedChange={onCheckedChange} />
    );
    expect(screen.getByTestId('cb').getAttribute('aria-checked')).toBe('true');
  });

  it('uncontrolled mode with defaultChecked', () => {
    render(
      <Checkbox.Root testID="cb" defaultChecked={true}>
        <Checkbox.Indicator testID="indicator" />
      </Checkbox.Root>
    );
    expect(screen.getByTestId('cb').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('indicator')).toBeTruthy();
  });

  it('indicator visible when checked, hidden when unchecked', () => {
    const { rerender } = render(
      <Checkbox.Root checked={false} onCheckedChange={vi.fn()}>
        <Checkbox.Indicator testID="indicator" />
      </Checkbox.Root>
    );
    expect(screen.queryByTestId('indicator')).toBeNull();

    rerender(
      <Checkbox.Root checked={true} onCheckedChange={vi.fn()}>
        <Checkbox.Indicator testID="indicator" />
      </Checkbox.Root>
    );
    expect(screen.getByTestId('indicator')).toBeTruthy();
  });

  it('indicator visible with forceMount regardless of checked', () => {
    render(
      <Checkbox.Root checked={false} onCheckedChange={vi.fn()}>
        <Checkbox.Indicator testID="indicator" forceMount />
      </Checkbox.Root>
    );
    expect(screen.getByTestId('indicator')).toBeTruthy();
  });

  it('disabled prevents toggle', () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox.Root testID="cb" checked={false} onCheckedChange={onCheckedChange} disabled />
    );
    fireEvent.click(screen.getByTestId('cb'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('aria-checked reflects state', () => {
    render(<Checkbox.Root testID="cb" checked={true} onCheckedChange={vi.fn()} />);
    expect(screen.getByTestId('cb').getAttribute('aria-checked')).toBe('true');
  });

  it('asChild works on Root', () => {
    render(
      <Checkbox.Root asChild checked={false} onCheckedChange={vi.fn()}>
        <View testID="child" />
      </Checkbox.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('checkbox');
  });
});
