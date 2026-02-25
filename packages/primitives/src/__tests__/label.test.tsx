import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text, View } from 'react-native';
import * as Label from '../label';

describe('Label', () => {
  it('renders text content', () => {
    render(<Label.Root testID="label">Username</Label.Root>);
    expect(screen.getByTestId('label')).toBeTruthy();
    expect(screen.getByText('Username')).toBeTruthy();
  });

  it('sets nativeID attribute (maps to id in web)', () => {
    render(
      <Label.Root testID="label" nativeID="my-label">
        Email
      </Label.Root>
    );
    const el = screen.getByTestId('label');
    expect(el.getAttribute('id') || el.id).toBe('my-label');
  });

  it('asChild merges props onto child', () => {
    render(
      <Label.Root asChild nativeID="slot-label">
        <Text testID="child">Slotted</Text>
      </Label.Root>
    );
    const child = screen.getByTestId('child');
    expect(child).toBeTruthy();
    expect(child.getAttribute('id') || child.id).toBe('slot-label');
  });

  it('context provides nativeID to descendants', () => {
    function Consumer() {
      const ctx = Label.useRootContext();
      return <View testID="consumer" accessibilityLabel={ctx.nativeID} />;
    }

    render(
      <Label.Root nativeID="ctx-label">
        <Consumer />
      </Label.Root>
    );
    const consumer = screen.getByTestId('consumer');
    expect(
      consumer.getAttribute('aria-label') || consumer.getAttribute('accessibilityLabel')
    ).toBe('ctx-label');
  });
});
