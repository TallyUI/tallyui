import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { View } from 'react-native';
import * as Separator from '../separator';

describe('Separator', () => {
  it('renders with role="separator" by default', () => {
    render(<Separator.Root testID="sep" />);
    expect(screen.getByTestId('sep').getAttribute('role')).toBe('separator');
  });

  it('sets role="presentation" when decorative is true', () => {
    render(<Separator.Root testID="sep" decorative />);
    expect(screen.getByTestId('sep').getAttribute('role')).toBe('presentation');
  });

  it('sets aria-orientation', () => {
    render(<Separator.Root testID="sep" orientation="vertical" />);
    expect(screen.getByTestId('sep').getAttribute('aria-orientation')).toBe('vertical');
  });

  it('default orientation is horizontal', () => {
    render(<Separator.Root testID="sep" />);
    expect(screen.getByTestId('sep').getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('asChild merges props onto child', () => {
    render(
      <Separator.Root asChild orientation="vertical" decorative>
        <View testID="child" />
      </Separator.Root>
    );
    const child = screen.getByTestId('child');
    expect(child.getAttribute('role')).toBe('presentation');
    expect(child.getAttribute('aria-orientation')).toBe('vertical');
  });
});
