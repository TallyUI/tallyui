import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text } from 'react-native';
import * as TextPrimitive from '../text';

describe('Text', () => {
  it('renders text content', () => {
    render(<TextPrimitive.Root testID="text">Hello</TextPrimitive.Root>);
    expect(screen.getByTestId('text')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('asChild merges props onto child', () => {
    render(
      <TextPrimitive.Root asChild testID="slot-text">
        <Text>Slotted</Text>
      </TextPrimitive.Root>
    );
    expect(screen.getByTestId('slot-text')).toBeTruthy();
    expect(screen.getByText('Slotted')).toBeTruthy();
  });

  it('TextClassContext defaults to undefined', () => {
    function Consumer() {
      const ctx = React.useContext(TextPrimitive.TextClassContext);
      return <Text testID="ctx-val">{ctx ?? 'none'}</Text>;
    }
    render(<Consumer />);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('TextClassContext propagates value to descendants', () => {
    function Consumer() {
      const ctx = React.useContext(TextPrimitive.TextClassContext);
      return <Text testID="ctx-val">{ctx ?? 'none'}</Text>;
    }
    render(
      <TextPrimitive.TextClassContext.Provider value="text-sm text-muted">
        <Consumer />
      </TextPrimitive.TextClassContext.Provider>
    );
    expect(screen.getByText('text-sm text-muted')).toBeTruthy();
  });

  it('Root consumes TextClassContext and merges with className', () => {
    // Spy on the merged className by checking Root renders without error
    // when both context and prop className are provided
    render(
      <TextPrimitive.TextClassContext.Provider value="text-sm">
        <TextPrimitive.Root testID="merged" className="font-bold">
          Merged
        </TextPrimitive.Root>
      </TextPrimitive.TextClassContext.Provider>
    );
    expect(screen.getByTestId('merged')).toBeTruthy();
    expect(screen.getByText('Merged')).toBeTruthy();
  });
});
