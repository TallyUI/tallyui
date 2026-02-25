import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Popover from '../popover';
import { PortalHost } from '../portal';

describe('Popover', () => {
  const renderPopover = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <Popover.Root {...props}>
          <Popover.Trigger testID="trigger">Open</Popover.Trigger>
          <Popover.Portal>
            <Popover.Overlay testID="overlay" />
            <Popover.Content testID="content">
              Popover body
              <Popover.Close testID="close">Close</Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    );

  it('is closed by default', () => {
    renderPopover();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('opens on trigger click', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes on close click', () => {
    renderPopover({ defaultOpen: true });
    fireEvent.click(screen.getByTestId('close'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled state', () => {
    const onOpenChange = vi.fn();
    renderPopover({ open: false, onOpenChange });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('content has dialog role', () => {
    renderPopover({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('dialog');
  });

  it('trigger has button role', () => {
    renderPopover();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('button');
  });

  it('overlay closes on click when closeOnPress is true', () => {
    renderPopover({ defaultOpen: true });
    fireEvent.click(screen.getByTestId('overlay'));
    expect(screen.queryByTestId('content')).toBeNull();
  });
});
