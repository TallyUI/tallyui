import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text, TextInput, View } from 'react-native';
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

  it('keeps a later portal mounted, with its state, when an earlier one leaves the host', () => {
    let mounts = 0;
    function Editor() {
      const [value, setValue] = React.useState('');
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <TextInput testID="b-input" value={value} onChangeText={setValue} />;
    }
    const b = <Editor />;
    // `a` keeps its slot as null, so only the host's own rendering can remount b.
    const Tree = ({ showA }: { showA: boolean }) => (
      <View>
        <PortalHost />
        {showA ? (
          <Portal name="a">
            <Text>A</Text>
          </Portal>
        ) : null}
        <Portal name="b">{b}</Portal>
      </View>
    );
    const { rerender } = render(<Tree showA />);
    const input = screen.getByTestId('b-input');
    fireEvent.change(input, { target: { value: 'typed' } });
    expect((screen.getByTestId('b-input') as HTMLInputElement).value).toBe('typed');

    rerender(<Tree showA={false} />);
    expect(screen.queryByText('A')).toBeNull();
    expect(mounts).toBe(1);
    expect((screen.getByTestId('b-input') as HTMLInputElement).value).toBe('typed');
    expect(screen.getByTestId('b-input')).toBe(input);
  });
});
