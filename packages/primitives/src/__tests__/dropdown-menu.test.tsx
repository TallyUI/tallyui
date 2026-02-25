import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as DropdownMenu from '../dropdown-menu';
import { PortalHost } from '../portal';

describe('DropdownMenu', () => {
  const renderMenu = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <DropdownMenu.Root {...props}>
          <DropdownMenu.Trigger testID="trigger">Menu</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content testID="content">
              <DropdownMenu.Item testID="item-1">Item 1</DropdownMenu.Item>
              <DropdownMenu.Separator testID="sep" />
              <DropdownMenu.Item testID="item-2">Item 2</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    );

  it('is closed by default', () => {
    renderMenu();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('opens on trigger click', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('trigger'));
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

  it('fires item onPress and closes menu', () => {
    const onPress = vi.fn();
    render(
      <div>
        <PortalHost />
        <DropdownMenu.Root defaultOpen>
          <DropdownMenu.Trigger>M</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>
              <DropdownMenu.Item testID="pressable-item" onPress={onPress}>
                Click me
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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
        <DropdownMenu.Root defaultOpen>
          <DropdownMenu.Trigger>M</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>
              <DropdownMenu.CheckboxItem
                testID="checkbox"
                checked={false}
                onCheckedChange={onCheckedChange}
                closeOnPress={false}
              >
                Toggle
              </DropdownMenu.CheckboxItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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
        <DropdownMenu.Root defaultOpen>
          <DropdownMenu.Trigger>M</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>
              <DropdownMenu.RadioGroup value="a" onValueChange={onValueChange}>
                <DropdownMenu.RadioItem testID="radio-b" value="b" closeOnPress={false}>
                  B
                </DropdownMenu.RadioItem>
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    );
    fireEvent.click(screen.getByTestId('radio-b'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});
