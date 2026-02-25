import { render, screen, fireEvent } from '@testing-library/react';
import { Pressable, View } from 'react-native';
import { describe, it, expect, vi } from 'vitest';
import * as Combobox from '../combobox';
import { PortalHost } from '../portal';

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('Combobox', () => {
  const renderCombobox = (props: Record<string, any> = {}, items = FRUITS) =>
    render(
      <div>
        <PortalHost />
        <Combobox.Root {...props}>
          <Combobox.Input testID="input" placeholder="Search fruits..." />
          <Combobox.Trigger testID="trigger" />
          <Combobox.Portal>
            <Combobox.Content testID="content">
              {items.map((fruit) => (
                <Combobox.Item
                  key={fruit.value}
                  value={fruit.value}
                  label={fruit.label}
                  testID={`item-${fruit.value}`}
                >
                  <Combobox.ItemText />
                </Combobox.Item>
              ))}
              {items.length === 0 && (
                <Combobox.Empty testID="empty">
                  <span>No results</span>
                </Combobox.Empty>
              )}
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox.Root>
      </div>
    );

  // -------------------------------------------------------------------------
  // ARIA roles
  // -------------------------------------------------------------------------

  it('input has role="combobox"', () => {
    renderCombobox({ defaultOpen: true });
    expect(screen.getByTestId('input').getAttribute('role')).toBe('combobox');
  });

  it('content has role="listbox"', () => {
    renderCombobox({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('listbox');
  });

  it('items have role="option"', () => {
    renderCombobox({ defaultOpen: true });
    expect(screen.getByTestId('item-apple').getAttribute('role')).toBe('option');
    expect(screen.getByTestId('item-banana').getAttribute('role')).toBe('option');
  });

  it('trigger has role="button"', () => {
    renderCombobox();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('button');
  });

  // -------------------------------------------------------------------------
  // aria-expanded
  // -------------------------------------------------------------------------

  it('aria-expanded on input reflects open state', () => {
    renderCombobox();
    const input = screen.getByTestId('input');
    expect(input.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByTestId('trigger'));
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  // -------------------------------------------------------------------------
  // aria-selected
  // -------------------------------------------------------------------------

  it('aria-selected is true on the selected item', () => {
    renderCombobox({
      defaultOpen: true,
      value: { value: 'apple', label: 'Apple' },
    });
    expect(screen.getByTestId('item-apple').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('item-banana').getAttribute('aria-selected')).toBe('false');
  });

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  it('selecting an item updates value and closes dropdown', () => {
    const onValueChange = vi.fn();
    renderCombobox({ onValueChange, defaultOpen: true });

    fireEvent.click(screen.getByTestId('item-apple'));

    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'apple', label: 'Apple' })
    );
    // Dropdown should be closed after selection
    expect(screen.queryByTestId('content')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Controlled value
  // -------------------------------------------------------------------------

  it('controlled value mode', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <div>
        <PortalHost />
        <Combobox.Root
          value={{ value: 'banana', label: 'Banana' }}
          onValueChange={onValueChange}
          defaultOpen
        >
          <Combobox.Input testID="input" placeholder="Search..." />
          <Combobox.Portal>
            <Combobox.Content testID="content">
              <Combobox.Item value="apple" label="Apple" testID="item-apple">
                <Combobox.ItemText />
              </Combobox.Item>
              <Combobox.Item value="banana" label="Banana" testID="item-banana">
                <Combobox.ItemText />
              </Combobox.Item>
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox.Root>
      </div>
    );

    expect(screen.getByTestId('item-banana').getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByTestId('item-apple'));
    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'apple', label: 'Apple' })
    );

    // Re-render with new controlled value
    rerender(
      <div>
        <PortalHost />
        <Combobox.Root
          value={{ value: 'apple', label: 'Apple' }}
          onValueChange={onValueChange}
          open
        >
          <Combobox.Input testID="input" placeholder="Search..." />
          <Combobox.Portal>
            <Combobox.Content testID="content">
              <Combobox.Item value="apple" label="Apple" testID="item-apple">
                <Combobox.ItemText />
              </Combobox.Item>
              <Combobox.Item value="banana" label="Banana" testID="item-banana">
                <Combobox.ItemText />
              </Combobox.Item>
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox.Root>
      </div>
    );

    expect(screen.getByTestId('item-apple').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('item-banana').getAttribute('aria-selected')).toBe('false');
  });

  // -------------------------------------------------------------------------
  // Controlled open
  // -------------------------------------------------------------------------

  it('controlled open mode', () => {
    const onOpenChange = vi.fn();
    renderCombobox({ open: true, onOpenChange });

    expect(screen.getByTestId('content')).toBeTruthy();

    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // -------------------------------------------------------------------------
  // Search value
  // -------------------------------------------------------------------------

  it('search value updates on input change', () => {
    const onSearchValueChange = vi.fn();
    renderCombobox({ onSearchValueChange });

    const input = screen.getByTestId('input');
    fireEvent.change(input, { target: { value: 'app' } });

    expect(onSearchValueChange).toHaveBeenCalledWith('app');
  });

  // -------------------------------------------------------------------------
  // Trigger toggles dropdown
  // -------------------------------------------------------------------------

  it('trigger toggles dropdown open and closed', () => {
    renderCombobox();

    // Initially closed
    expect(screen.queryByTestId('content')).toBeNull();

    // Open
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();

    // Close
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Input opens dropdown on focus
  // -------------------------------------------------------------------------

  it('opens dropdown on input focus', () => {
    renderCombobox();

    expect(screen.queryByTestId('content')).toBeNull();

    fireEvent.focus(screen.getByTestId('input'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Input opens dropdown on typing
  // -------------------------------------------------------------------------

  it('opens dropdown when user types in input', () => {
    renderCombobox();

    expect(screen.queryByTestId('content')).toBeNull();

    fireEvent.change(screen.getByTestId('input'), { target: { value: 'b' } });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Empty component renders
  // -------------------------------------------------------------------------

  it('renders empty component when no items', () => {
    renderCombobox({ defaultOpen: true }, []);
    expect(screen.getByTestId('empty')).toBeTruthy();
    expect(screen.getByText('No results')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // asChild
  // -------------------------------------------------------------------------

  it('asChild works on trigger', () => {
    render(
      <div>
        <PortalHost />
        <Combobox.Root>
          <Combobox.Input testID="input" placeholder="Search..." />
          <Combobox.Trigger asChild>
            <Pressable testID="custom-trigger">
              <View />
            </Pressable>
          </Combobox.Trigger>
          <Combobox.Portal>
            <Combobox.Content testID="content">
              <Combobox.Item value="apple" label="Apple" testID="item-apple">
                <Combobox.ItemText />
              </Combobox.Item>
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox.Root>
      </div>
    );

    const trigger = screen.getByTestId('custom-trigger');
    // Slot merges role onto the child element
    expect(trigger.getAttribute('role')).toBe('button');

    fireEvent.click(trigger);
    expect(screen.getByTestId('content')).toBeTruthy();
  });
});
