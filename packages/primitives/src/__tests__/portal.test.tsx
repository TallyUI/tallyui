import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text, View } from 'react-native';
import { Portal, PortalHost } from '../portal';

describe('Portal', () => {
  it('renders children at PortalHost location', () => {
    render(
      <View>
        <PortalHost />
        <Portal name="test-portal">
          <Text>Portaled content</Text>
        </Portal>
      </View>
    );
    expect(screen.getByText('Portaled content')).toBeTruthy();
  });

  it('supports named hosts', () => {
    render(
      <View>
        <PortalHost name="host-a" />
        <PortalHost name="host-b" />
        <Portal name="p1" hostName="host-b">
          <Text>In host B</Text>
        </Portal>
      </View>
    );
    expect(screen.getByText('In host B')).toBeTruthy();
  });

  it('cleans up on unmount', () => {
    const { rerender } = render(
      <View>
        <PortalHost />
        <Portal name="cleanup-test">
          <Text>Temporary</Text>
        </Portal>
      </View>
    );
    expect(screen.getByText('Temporary')).toBeTruthy();

    rerender(
      <View>
        <PortalHost />
      </View>
    );
    expect(screen.queryByText('Temporary')).toBeNull();
  });

  it('renders multiple portals in same host', () => {
    render(
      <View>
        <PortalHost />
        <Portal name="p1">
          <Text>First</Text>
        </Portal>
        <Portal name="p2">
          <Text>Second</Text>
        </Portal>
      </View>
    );
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });
});
