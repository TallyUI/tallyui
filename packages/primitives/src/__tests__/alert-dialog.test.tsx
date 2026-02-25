import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as AlertDialog from '../alert-dialog';
import { PortalHost } from '../portal';

describe('AlertDialog', () => {
  const renderAlertDialog = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <AlertDialog.Root {...props}>
          <AlertDialog.Trigger testID="trigger">Open</AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay testID="overlay" />
            <AlertDialog.Content testID="content">
              <AlertDialog.Title testID="title">Are you sure?</AlertDialog.Title>
              <AlertDialog.Description testID="description">
                This action cannot be undone.
              </AlertDialog.Description>
              <AlertDialog.Cancel testID="cancel">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action testID="action">Confirm</AlertDialog.Action>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    );

  it('is closed by default', () => {
    renderAlertDialog();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('opens when trigger is clicked', () => {
    renderAlertDialog();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes when action is clicked', () => {
    renderAlertDialog({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.click(screen.getByTestId('action'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('closes when cancel is clicked', () => {
    renderAlertDialog({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cancel'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled open state', () => {
    const onOpenChange = vi.fn();
    renderAlertDialog({ open: false, onOpenChange });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('supports uncontrolled with defaultOpen', () => {
    renderAlertDialog({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('content has alertdialog role', () => {
    renderAlertDialog({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('alertdialog');
  });

  it('title has heading role', () => {
    renderAlertDialog({ defaultOpen: true });
    expect(screen.getByTestId('title').getAttribute('role')).toBe('heading');
  });

  it('trigger has button role', () => {
    renderAlertDialog();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('button');
  });

  it('links title and description via aria attributes', () => {
    renderAlertDialog({ defaultOpen: true });
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

  it('overlay renders when open', () => {
    renderAlertDialog({ defaultOpen: true });
    expect(screen.getByTestId('overlay')).toBeTruthy();
  });

  it('overlay does not render when closed', () => {
    renderAlertDialog();
    expect(screen.queryByTestId('overlay')).toBeNull();
  });

  it('asChild works on trigger', () => {
    render(
      <div>
        <PortalHost />
        <AlertDialog.Root>
          <AlertDialog.Trigger asChild>
            <button type="button" data-testid="custom-trigger">Custom trigger</button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Content testID="content">
              <AlertDialog.Action testID="action">Confirm</AlertDialog.Action>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    );

    const trigger = screen.getByTestId('custom-trigger');
    // asChild renders the child element with the slot's role prop merged in
    expect(trigger.getAttribute('role')).toBe('button');
    expect(trigger.tagName).toBe('BUTTON');
  });
});
