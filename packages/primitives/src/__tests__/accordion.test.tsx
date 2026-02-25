import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View, Text } from 'react-native';
import * as Accordion from '../accordion';

function renderAccordion(rootProps: any = {}) {
  return render(
    <Accordion.Root type="single" {...rootProps}>
      <Accordion.Item value="a">
        <Accordion.Header>
          <Accordion.Trigger testID="trigger-a">
            <Text>Item A</Text>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content testID="content-a">
          <Text>Content A</Text>
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="b">
        <Accordion.Header>
          <Accordion.Trigger testID="trigger-b">
            <Text>Item B</Text>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content testID="content-b">
          <Text>Content B</Text>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}

describe('Accordion', () => {
  describe('single type', () => {
    it('clicking trigger expands item', () => {
      const onValueChange = vi.fn();
      renderAccordion({ onValueChange });
      fireEvent.click(screen.getByTestId('trigger-a'));
      expect(onValueChange).toHaveBeenCalledWith('a');
    });

    it('non-collapsible: re-clicking does not collapse', () => {
      const onValueChange = vi.fn();
      renderAccordion({ value: 'a', onValueChange });
      fireEvent.click(screen.getByTestId('trigger-a'));
      // Should not call onValueChange since non-collapsible single won't toggle off
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('collapsible: re-clicking collapses', () => {
      const onValueChange = vi.fn();
      renderAccordion({ value: 'a', onValueChange, collapsible: true });
      fireEvent.click(screen.getByTestId('trigger-a'));
      expect(onValueChange).toHaveBeenCalledWith('');
    });

    it('opening one closes the other', () => {
      const onValueChange = vi.fn();
      renderAccordion({ value: 'a', onValueChange });
      fireEvent.click(screen.getByTestId('trigger-b'));
      expect(onValueChange).toHaveBeenCalledWith('b');
    });
  });

  describe('multiple type', () => {
    it('multiple items can be open', () => {
      const onValueChange = vi.fn();
      render(
        <Accordion.Root type="multiple" value={['a']} onValueChange={onValueChange}>
          <Accordion.Item value="a">
            <Accordion.Header>
              <Accordion.Trigger testID="trigger-a">
                <Text>Item A</Text>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content testID="content-a">
              <Text>Content A</Text>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="b">
            <Accordion.Header>
              <Accordion.Trigger testID="trigger-b">
                <Text>Item B</Text>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content testID="content-b">
              <Text>Content B</Text>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );
      expect(screen.getByTestId('content-a')).toBeTruthy();
      fireEvent.click(screen.getByTestId('trigger-b'));
      expect(onValueChange).toHaveBeenCalledWith(['a', 'b']);
    });

    it('re-clicking collapses item', () => {
      const onValueChange = vi.fn();
      render(
        <Accordion.Root type="multiple" value={['a', 'b']} onValueChange={onValueChange}>
          <Accordion.Item value="a">
            <Accordion.Header>
              <Accordion.Trigger testID="trigger-a">
                <Text>Item A</Text>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content testID="content-a">
              <Text>Content A</Text>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="b">
            <Accordion.Header>
              <Accordion.Trigger testID="trigger-b">
                <Text>Item B</Text>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content testID="content-b">
              <Text>Content B</Text>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );
      fireEvent.click(screen.getByTestId('trigger-a'));
      expect(onValueChange).toHaveBeenCalledWith(['b']);
    });
  });

  it('Header has role="heading"', () => {
    render(
      <Accordion.Root type="single">
        <Accordion.Item value="a">
          <Accordion.Header testID="header">
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('header').getAttribute('role')).toBe('heading');
  });

  it('Trigger has aria-expanded', () => {
    render(
      <Accordion.Root type="single" value="a" onValueChange={vi.fn()}>
        <Accordion.Item value="a">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="b">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-b">
              <Text>Item B</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <Text>Content B</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('trigger-a').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('trigger-b').getAttribute('aria-expanded')).toBe('false');
  });

  it('Content visible when expanded', () => {
    render(
      <Accordion.Root type="single" value="a" onValueChange={vi.fn()}>
        <Accordion.Item value="a">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-a">
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="b">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-b">
              <Text>Item B</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-b">
            <Text>Content B</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('content-a')).toBeTruthy();
    expect(screen.queryByTestId('content-b')).toBeNull();
  });

  it('Content with forceMount always renders', () => {
    render(
      <Accordion.Root type="single" onValueChange={vi.fn()}>
        <Accordion.Item value="a">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-a" forceMount>
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('content-a')).toBeTruthy();
  });

  it('controlled mode', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Accordion.Root type="single" value="a" onValueChange={onValueChange}>
        <Accordion.Item value="a">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-a">
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="b">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-b">
              <Text>Item B</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-b">
            <Text>Content B</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('trigger-a').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('trigger-b').getAttribute('aria-expanded')).toBe('false');

    rerender(
      <Accordion.Root type="single" value="b" onValueChange={onValueChange}>
        <Accordion.Item value="a">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-a">
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="b">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-b">
              <Text>Item B</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-b">
            <Text>Content B</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('trigger-a').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('trigger-b').getAttribute('aria-expanded')).toBe('true');
  });

  it('uncontrolled with defaultValue', () => {
    render(
      <Accordion.Root type="single" defaultValue="b">
        <Accordion.Item value="a">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-a">
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="b">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-b">
              <Text>Item B</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-b">
            <Text>Content B</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('trigger-a').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('trigger-b').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByTestId('content-a')).toBeNull();
    expect(screen.getByTestId('content-b')).toBeTruthy();
  });

  it('disabled root prevents all toggling', () => {
    const onValueChange = vi.fn();
    renderAccordion({ onValueChange, disabled: true });
    fireEvent.click(screen.getByTestId('trigger-a'));
    fireEvent.click(screen.getByTestId('trigger-b'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('disabled item prevents that item only', () => {
    const onValueChange = vi.fn();
    render(
      <Accordion.Root type="single" onValueChange={onValueChange}>
        <Accordion.Item value="a" disabled>
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-a">
              <Text>Item A</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-a">
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="b">
          <Accordion.Header>
            <Accordion.Trigger testID="trigger-b">
              <Text>Item B</Text>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content testID="content-b">
            <Text>Content B</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    );
    fireEvent.click(screen.getByTestId('trigger-a'));
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('trigger-b'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('asChild works on Item', () => {
    render(
      <Accordion.Root type="single">
        <Accordion.Item asChild value="a">
          <View testID="custom-item">
            <Accordion.Header>
              <Accordion.Trigger testID="trigger-a">
                <Text>Item A</Text>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>
              <Text>Content A</Text>
            </Accordion.Content>
          </View>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(screen.getByTestId('custom-item')).toBeTruthy();
  });
});
