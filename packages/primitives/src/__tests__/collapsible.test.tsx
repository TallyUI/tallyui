import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View, Text } from 'react-native';
import * as Collapsible from '../collapsible';

describe('Collapsible', () => {
  it('Trigger has role="button" and aria-expanded', () => {
    render(
      <Collapsible.Root>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    const trigger = screen.getByTestId('trigger');
    expect(trigger.getAttribute('role')).toBe('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('Content visible when open, hidden when closed', () => {
    const { rerender } = render(
      <Collapsible.Root open={false} onOpenChange={vi.fn()}>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    expect(screen.queryByTestId('content')).toBeNull();

    rerender(
      <Collapsible.Root open={true} onOpenChange={vi.fn()}>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('Content with forceMount always renders', () => {
    render(
      <Collapsible.Root open={false} onOpenChange={vi.fn()}>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content" forceMount>
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('clicking trigger toggles open', () => {
    const onOpenChange = vi.fn();
    render(
      <Collapsible.Root open={false} onOpenChange={onOpenChange}>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('controlled mode', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Collapsible.Root open={false} onOpenChange={onOpenChange}>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    expect(screen.getByTestId('trigger').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('content')).toBeNull();

    rerender(
      <Collapsible.Root open={true} onOpenChange={onOpenChange}>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    expect(screen.getByTestId('trigger').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('uncontrolled with defaultOpen', () => {
    render(
      <Collapsible.Root defaultOpen={true}>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    expect(screen.getByTestId('trigger').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('disabled prevents toggle', () => {
    const onOpenChange = vi.fn();
    render(
      <Collapsible.Root open={false} onOpenChange={onOpenChange} disabled>
        <Collapsible.Trigger testID="trigger" />
        <Collapsible.Content testID="content">
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('asChild works on Root', () => {
    render(
      <Collapsible.Root asChild>
        <View testID="child">
          <Collapsible.Trigger testID="trigger" />
          <Collapsible.Content>
            <Text>Content</Text>
          </Collapsible.Content>
        </View>
      </Collapsible.Root>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('asChild works on Trigger', () => {
    render(
      <Collapsible.Root>
        <Collapsible.Trigger asChild>
          <View testID="custom-trigger" />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <Text>Content</Text>
        </Collapsible.Content>
      </Collapsible.Root>
    );
    const trigger = screen.getByTestId('custom-trigger');
    expect(trigger.getAttribute('role')).toBe('button');
  });
});
