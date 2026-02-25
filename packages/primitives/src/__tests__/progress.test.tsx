import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { View } from 'react-native';
import * as Progress from '../progress';

describe('Progress', () => {
  it('renders with role="progressbar"', () => {
    render(<Progress.Root testID="progress" value={50} />);
    expect(screen.getByTestId('progress').getAttribute('role')).toBe('progressbar');
  });

  it('sets aria-valuemin, aria-valuemax, aria-valuenow', () => {
    render(<Progress.Root testID="progress" value={50} />);
    const el = screen.getByTestId('progress');
    expect(el.getAttribute('aria-valuemin')).toBe('0');
    expect(el.getAttribute('aria-valuemax')).toBe('100');
    expect(el.getAttribute('aria-valuenow')).toBe('50');
  });

  it('default max is 100', () => {
    render(<Progress.Root testID="progress" value={75} />);
    expect(screen.getByTestId('progress').getAttribute('aria-valuemax')).toBe('100');
  });

  it('custom max works', () => {
    render(<Progress.Root testID="progress" value={5} max={10} />);
    const el = screen.getByTestId('progress');
    expect(el.getAttribute('aria-valuemax')).toBe('10');
    expect(el.getAttribute('aria-valuenow')).toBe('5');
    expect(el.getAttribute('aria-valuetext')).toBe('50%');
  });

  it('indeterminate state (value=null) omits aria-valuenow', () => {
    render(<Progress.Root testID="progress" value={null} />);
    const el = screen.getByTestId('progress');
    expect(el.getAttribute('aria-valuenow')).toBeNull();
    expect(el.getAttribute('aria-valuetext')).toBeNull();
  });

  it('custom getValueLabel for aria-valuetext', () => {
    const getValueLabel = (value: number, max: number) => `${value} of ${max}`;
    render(<Progress.Root testID="progress" value={30} max={100} getValueLabel={getValueLabel} />);
    expect(screen.getByTestId('progress').getAttribute('aria-valuetext')).toBe('30 of 100');
  });

  it('default getValueLabel produces percentage', () => {
    render(<Progress.Root testID="progress" value={25} />);
    expect(screen.getByTestId('progress').getAttribute('aria-valuetext')).toBe('25%');
  });

  it('Indicator renders inside Root', () => {
    render(
      <Progress.Root testID="root" value={50}>
        <Progress.Indicator testID="indicator" />
      </Progress.Root>
    );
    expect(screen.getByTestId('root')).toBeTruthy();
    expect(screen.getByTestId('indicator')).toBeTruthy();
  });

  it('asChild works on Root', () => {
    render(
      <Progress.Root asChild value={50}>
        <View testID="child" />
      </Progress.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('progressbar');
  });
});
