import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Dialog from '../dialog';
import { PortalHost } from '../portal';

describe('Dialog', () => {
  const renderDialog = (props = {}, overlayProps = {}, contentProps = {}) =>
    render(
      <div>
        <PortalHost />
        <Dialog.Root {...props}>
          <Dialog.Trigger testID="trigger">Open</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay testID="overlay" {...overlayProps} />
            <Dialog.Content testID="content" {...contentProps}>
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

  it('closes when the overlay is pressed', () => {
    renderDialog({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.click(screen.getByTestId('overlay'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('stays open on an overlay press when closeOnPress is false', () => {
    renderDialog({ defaultOpen: true }, { closeOnPress: false });
    fireEvent.click(screen.getByTestId('overlay'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes on Escape', () => {
    renderDialog({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('keeps open when onEscapeKeyDown prevents default', () => {
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
    renderDialog({ defaultOpen: true }, {}, { onEscapeKeyDown });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscapeKeyDown).toHaveBeenCalledOnce();
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes only the topmost of two nested open dialogs on Escape', () => {
    render(
      <div>
        <PortalHost />
        <Dialog.Root defaultOpen>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content testID="outer-content">
              <Dialog.Root defaultOpen>
                <Dialog.Portal>
                  <Dialog.Overlay />
                  <Dialog.Content testID="inner-content" />
                </Dialog.Portal>
              </Dialog.Root>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>,
    );
    expect(screen.getByTestId('inner-content')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('inner-content')).toBeNull();
    expect(screen.getByTestId('outer-content')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('outer-content')).toBeNull();
  });

  it('keeps the inner dialog on top when the outer re-renders with a new onEscapeKeyDown', () => {
    function TestDialog() {
      const [count, setCount] = React.useState(0);
      const [innerOpen, setInnerOpen] = React.useState(false);
      return (
        <Dialog.Root defaultOpen>
          <Dialog.Content testID="outer" onEscapeKeyDown={() => {}}>
            <button data-testid="open-inner" onClick={() => setInnerOpen(true)}>Open inner</button>
            <button data-testid="rerender" onClick={() => setCount(count + 1)}>Re-render</button>
            <span>{count}</span>
            <Dialog.Root open={innerOpen} onOpenChange={setInnerOpen}>
              <Dialog.Content testID="inner" />
            </Dialog.Root>
          </Dialog.Content>
        </Dialog.Root>
      );
    }

    render(<TestDialog />);
    fireEvent.click(screen.getByTestId('open-inner'));
    fireEvent.click(screen.getByTestId('rerender'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('inner')).toBeNull();
    expect(screen.getByTestId('outer')).toBeTruthy();
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
