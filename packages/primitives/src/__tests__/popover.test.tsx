import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Dialog from '../dialog';
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

describe('dismiss on web', () => {
  type RootProps = Partial<React.ComponentProps<typeof Popover.Root>>;
  type ContentProps = Partial<React.ComponentProps<typeof Popover.Content>>;

  const renderDismissable = ({
    withOverlay = false,
    rootProps = {},
    contentProps = {},
  }: { withOverlay?: boolean; rootProps?: RootProps; contentProps?: ContentProps } = {}) =>
    render(
      <div>
        <PortalHost />
        <button data-testid="outside">Outside</button>
        <Popover.Root {...rootProps}>
          <Popover.Trigger testID="trigger">Open</Popover.Trigger>
          <Popover.Portal>
            {withOverlay ? <Popover.Overlay testID="overlay" /> : null}
            <Popover.Content testID="content" {...contentProps}>
              <span data-testid="inside">Popover body</span>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    );

  it('Escape closes an open popover', () => {
    const onOpenChange = vi.fn();
    function Controlled() {
      const [open, setOpen] = React.useState(true);
      const change = (next: boolean) => {
        onOpenChange(next);
        setOpen(next);
      };
      return (
        <div>
          <PortalHost />
          <Popover.Root open={open} onOpenChange={change}>
            <Popover.Trigger testID="trigger">Open</Popover.Trigger>
            <Popover.Portal>
              <Popover.Content testID="content">Popover body</Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      );
    }
    render(<Controlled />);
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('content')).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('onEscapeKeyDown can keep it open', () => {
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
    renderDismissable({ rootProps: { defaultOpen: true }, contentProps: { onEscapeKeyDown } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('content')).toBeTruthy();
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
  });

  it('Escape on a closed popover does nothing', () => {
    const onOpenChange = vi.fn();
    renderDismissable({ rootProps: { open: false, onOpenChange } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('a pointerdown outside closes it', () => {
    renderDismissable({ rootProps: { defaultOpen: true } });
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('a pointerdown inside the content keeps it open', () => {
    renderDismissable({ rootProps: { defaultOpen: true } });
    fireEvent.pointerDown(screen.getByTestId('inside'));
    fireEvent.pointerDown(screen.getByTestId('content'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it("a pointerdown on the trigger keeps it open, and the trigger's click then closes it once", () => {
    const onOpenChange = vi.fn();
    renderDismissable({ rootProps: { open: true, onOpenChange } });
    fireEvent.pointerDown(screen.getByTestId('trigger'));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('with an Overlay mounted, an outside pointerdown leaves closing to the Overlay', () => {
    renderDismissable({ withOverlay: true, rootProps: { defaultOpen: true } });
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('onPointerDownOutside can keep it open and receives the original event', () => {
    const onPointerDownOutside = vi.fn((event: CustomEvent<{ originalEvent: PointerEvent }>) =>
      event.preventDefault()
    );
    renderDismissable({ rootProps: { defaultOpen: true }, contentProps: { onPointerDownOutside } });
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.getByTestId('content')).toBeTruthy();
    expect(onPointerDownOutside).toHaveBeenCalledTimes(1);
    const outside = onPointerDownOutside.mock.calls[0][0];
    expect(outside).toBeInstanceOf(CustomEvent);
    expect(outside.detail.originalEvent.type).toBe('pointerdown');
  });

  it('only the topmost of two open popovers reacts', () => {
    const renderTwo = () =>
      render(
        <div>
          <PortalHost />
          <button data-testid="outside">Outside</button>
          <Popover.Root defaultOpen>
            <Popover.Trigger testID="trigger-a">A</Popover.Trigger>
            <Popover.Portal>
              <Popover.Content testID="content-a">A body</Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Popover.Root defaultOpen>
            <Popover.Trigger testID="trigger-b">B</Popover.Trigger>
            <Popover.Portal>
              <Popover.Content testID="content-b">B body</Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      );
    const dismissals = [
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.pointerDown(screen.getByTestId('outside')),
    ];
    for (const dismiss of dismissals) {
      const { unmount } = renderTwo();
      dismiss();
      expect(screen.getByTestId('content-a')).toBeTruthy();
      expect(screen.queryByTestId('content-b')).toBeNull();
      dismiss();
      expect(screen.queryByTestId('content-a')).toBeNull();
      unmount();
    }
  });

  it('a popover above a Dialog takes Escape first', () => {
    render(
      <div>
        <PortalHost />
        <Dialog.Root defaultOpen>
          <Dialog.Portal>
            <Dialog.Content testID="dialog-content">
              <Popover.Root defaultOpen>
                <Popover.Trigger testID="trigger">Open</Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content testID="content">Popover body</Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('content')).toBeNull();
    expect(screen.getByTestId('dialog-content')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('dialog-content')).toBeNull();
  });

  it('the dismiss props are not passed to the host', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderDismissable({
        rootProps: { defaultOpen: true },
        contentProps: { onEscapeKeyDown: () => {}, onPointerDownOutside: () => {} },
      });
      const content = screen.getByTestId('content');
      expect(content.hasAttribute('onescapekeydown')).toBe(false);
      expect(content.hasAttribute('onpointerdownoutside')).toBe(false);
      const unknownHandler = consoleError.mock.calls.some((args) =>
        args.some((arg) => typeof arg === 'string' && /unknown event handler/i.test(arg))
      );
      expect(unknownHandler).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});

it('R1: a closed force-mounted popover does not take Escape or outside presses from an open one', () => {
  const dismissals = [
    () => fireEvent.keyDown(document, { key: 'Escape' }),
    () => fireEvent.pointerDown(screen.getByTestId('outside')),
  ];
  for (const dismiss of dismissals) {
    const onA = vi.fn();
    const { unmount } = render(
      <>
        <PortalHost />
        <button data-testid="outside">Outside</button>
        <Popover.Root open onOpenChange={onA}>
          <Popover.Portal>
            <Popover.Content testID="a" />
          </Popover.Portal>
        </Popover.Root>
        <Popover.Root open={false} onOpenChange={() => {}}>
          <Popover.Portal forceMount>
            <Popover.Content forceMount testID="b" />
          </Popover.Portal>
        </Popover.Root>
      </>,
    );
    dismiss();
    expect(onA).toHaveBeenCalledWith(false);
    unmount();
  }
});
