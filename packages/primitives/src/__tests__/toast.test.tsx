import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Pressable, View, Text } from 'react-native';
import * as Toast from '../toast';

describe('Toast', () => {
  it('Root has role="status"', () => {
    render(
      <Toast.Root open testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.getByTestId('root').getAttribute('role')).toBe('status');
  });

  it('Root has aria-live="assertive" for foreground (default)', () => {
    render(
      <Toast.Root open testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.getByTestId('root').getAttribute('aria-live')).toBe('assertive');
  });

  it('Root has aria-live="polite" for background', () => {
    render(
      <Toast.Root open type="background" testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.getByTestId('root').getAttribute('aria-live')).toBe('polite');
  });

  it('not rendered when closed', () => {
    render(
      <Toast.Root open={false} onOpenChange={vi.fn()} testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.queryByTestId('root')).toBeNull();
  });

  it('rendered when open', () => {
    render(
      <Toast.Root open testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.getByTestId('root')).toBeTruthy();
  });

  it('Close button closes the toast', () => {
    const onOpenChange = vi.fn();
    render(
      <Toast.Root open onOpenChange={onOpenChange}>
        <Toast.Title>Title</Toast.Title>
        <Toast.Close testID="close" />
      </Toast.Root>
    );
    fireEvent.click(screen.getByTestId('close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('controlled mode', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Toast.Root open={false} onOpenChange={onOpenChange} testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.queryByTestId('root')).toBeNull();

    rerender(
      <Toast.Root open={true} onOpenChange={onOpenChange} testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.getByTestId('root')).toBeTruthy();
  });

  it('uncontrolled with defaultOpen=true', () => {
    render(
      <Toast.Root defaultOpen={true} testID="root">
        <Toast.Title>Title</Toast.Title>
      </Toast.Root>
    );
    expect(screen.getByTestId('root')).toBeTruthy();
  });

  it('Action button renders with role="button"', () => {
    render(
      <Toast.Root open>
        <Toast.Action testID="action" altText="Undo" />
      </Toast.Root>
    );
    expect(screen.getByTestId('action').getAttribute('role')).toBe('button');
  });

  it('Title and Description render text', () => {
    render(
      <Toast.Root open>
        <Toast.Title>Toast Title</Toast.Title>
        <Toast.Description>Toast Description</Toast.Description>
      </Toast.Root>
    );
    expect(screen.getByText('Toast Title')).toBeTruthy();
    expect(screen.getByText('Toast Description')).toBeTruthy();
  });

  it('asChild works on Root', () => {
    render(
      <Toast.Root open asChild>
        <View testID="child">
          <Toast.Title>Title</Toast.Title>
        </View>
      </Toast.Root>
    );
    const child = screen.getByTestId('child');
    expect(child).toBeTruthy();
    expect(child.getAttribute('role')).toBe('status');
  });

  it('asChild works on Close', () => {
    const onOpenChange = vi.fn();
    render(
      <Toast.Root open onOpenChange={onOpenChange}>
        <Toast.Close asChild>
          <Pressable testID="custom-close" />
        </Toast.Close>
      </Toast.Root>
    );
    const close = screen.getByTestId('custom-close');
    expect(close.getAttribute('role')).toBe('button');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
