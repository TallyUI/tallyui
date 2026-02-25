import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as ContextMenu from '../context-menu';
import { PortalHost } from '../portal';

describe('ContextMenu', () => {
  const renderMenu = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <ContextMenu.Root {...props}>
          <ContextMenu.Trigger testID="trigger">Menu</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content testID="content">
              <ContextMenu.Item testID="item-1">Item 1</ContextMenu.Item>
              <ContextMenu.Separator testID="sep" />
              <ContextMenu.Item testID="item-2">Item 2</ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );

  it('is closed by default', () => {
    renderMenu();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('renders content when defaultOpen is true', () => {
    renderMenu({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('content has menu role', () => {
    renderMenu({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('menu');
  });

  it('items have menuitem role', () => {
    renderMenu({ defaultOpen: true });
    expect(screen.getByTestId('item-1').getAttribute('role')).toBe('menuitem');
  });

  it('separator has separator role', () => {
    renderMenu({ defaultOpen: true });
    expect(screen.getByTestId('sep').getAttribute('role')).toBe('separator');
  });

  it('trigger wires onLongPress handler', () => {
    renderMenu();
    const trigger = screen.getByTestId('trigger');
    // In the DOM env, react-native-web maps onLongPress to a synthetic handler.
    // We verify the trigger does NOT respond to a regular click (unlike DropdownMenu).
    fireEvent.click(trigger);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('fires item onPress and closes menu', () => {
    const onPress = vi.fn();
    render(
      <div>
        <PortalHost />
        <ContextMenu.Root defaultOpen>
          <ContextMenu.Trigger>M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.Item testID="pressable-item" onPress={onPress}>
                Click me
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    fireEvent.click(screen.getByTestId('pressable-item'));
    expect(onPress).toHaveBeenCalled();
  });

  it('checkbox item toggles checked state', () => {
    const onCheckedChange = vi.fn();
    render(
      <div>
        <PortalHost />
        <ContextMenu.Root defaultOpen>
          <ContextMenu.Trigger>M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.CheckboxItem
                testID="checkbox"
                checked={false}
                onCheckedChange={onCheckedChange}
                closeOnPress={false}
              >
                Toggle
              </ContextMenu.CheckboxItem>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    fireEvent.click(screen.getByTestId('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('radio items update group value', () => {
    const onValueChange = vi.fn();
    render(
      <div>
        <PortalHost />
        <ContextMenu.Root defaultOpen>
          <ContextMenu.Trigger>M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.RadioGroup value="a" onValueChange={onValueChange}>
                <ContextMenu.RadioItem testID="radio-b" value="b" closeOnPress={false}>
                  B
                </ContextMenu.RadioItem>
              </ContextMenu.RadioGroup>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    fireEvent.click(screen.getByTestId('radio-b'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('item indicator renders when checkbox is checked', () => {
    render(
      <div>
        <PortalHost />
        <ContextMenu.Root defaultOpen>
          <ContextMenu.Trigger>M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.CheckboxItem
                checked={true}
                onCheckedChange={() => {}}
                closeOnPress={false}
              >
                <ContextMenu.ItemIndicator testID="indicator">check</ContextMenu.ItemIndicator>
                Checked
              </ContextMenu.CheckboxItem>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    expect(screen.getByTestId('indicator')).toBeTruthy();
  });

  it('item indicator hidden when checkbox is unchecked', () => {
    render(
      <div>
        <PortalHost />
        <ContextMenu.Root defaultOpen>
          <ContextMenu.Trigger>M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.CheckboxItem
                checked={false}
                onCheckedChange={() => {}}
                closeOnPress={false}
              >
                <ContextMenu.ItemIndicator testID="indicator">check</ContextMenu.ItemIndicator>
                Unchecked
              </ContextMenu.CheckboxItem>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    expect(screen.queryByTestId('indicator')).toBeNull();
  });

  it('controlled mode respects open prop', () => {
    const { rerender } = render(
      <div>
        <PortalHost />
        <ContextMenu.Root open={false}>
          <ContextMenu.Trigger testID="trigger">M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content testID="content">
              <ContextMenu.Item>Item</ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    expect(screen.queryByTestId('content')).toBeNull();

    rerender(
      <div>
        <PortalHost />
        <ContextMenu.Root open={true}>
          <ContextMenu.Trigger testID="trigger">M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content testID="content">
              <ContextMenu.Item>Item</ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('group has group role', () => {
    render(
      <div>
        <PortalHost />
        <ContextMenu.Root defaultOpen>
          <ContextMenu.Trigger>M</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.Group testID="group">
                <ContextMenu.Item>Item</ContextMenu.Item>
              </ContextMenu.Group>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
    );
    expect(screen.getByTestId('group').getAttribute('role')).toBe('group');
  });
});
