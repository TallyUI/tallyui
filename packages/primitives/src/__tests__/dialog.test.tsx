import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Dialog from '../dialog';
import { PortalHost } from '../portal';

describe('Dialog', () => {
  const renderDialog = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <Dialog.Root {...props}>
          <Dialog.Trigger testID="trigger">Open</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay testID="overlay" />
            <Dialog.Content testID="content">
              <Dialog.Title testID="title">Dialog Title</Dialog.Title>
              <Dialog.Description testID="description">
                Dialog description
              </Dialog.Description>
              <Dialog.Close testID="close">Close</Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );

  it('is closed by default', () => {
    renderDialog();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('opens when trigger is clicked', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes when close is clicked', () => {
    renderDialog({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.click(screen.getByTestId('close'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled open state', () => {
    const onOpenChange = vi.fn();
    renderDialog({ open: false, onOpenChange });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('content has dialog role', () => {
    renderDialog({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('dialog');
  });

  it('title has heading role', () => {
    renderDialog({ defaultOpen: true });
    expect(screen.getByTestId('title').getAttribute('role')).toBe('heading');
  });

  it('trigger has button role', () => {
    renderDialog();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('button');
  });

  it('links title and description via nativeID/id', () => {
    renderDialog({ defaultOpen: true });
    const content = screen.getByTestId('content');
    const title = screen.getByTestId('title');
    const description = screen.getByTestId('description');

    const labelledBy = content.getAttribute('aria-labelledby');
    const describedBy = content.getAttribute('aria-describedby');

    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(title.getAttribute('id') || title.id).toBe(labelledBy);
    expect(description.getAttribute('id') || description.id).toBe(describedBy);
  });
});
