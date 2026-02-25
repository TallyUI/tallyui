import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Select from '../select';
import { PortalHost } from '../portal';

describe('Select', () => {
  const renderSelect = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <Select.Root {...props}>
          <Select.Trigger testID="trigger">
            <Select.Value testID="value" placeholder="Pick a fruit" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content testID="content">
              <Select.Item value="apple" label="Apple" testID="item-apple">
                <Select.ItemText />
              </Select.Item>
              <Select.Item value="banana" label="Banana" testID="item-banana">
                <Select.ItemText />
              </Select.Item>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    );

  it('shows placeholder when no value selected', () => {
    renderSelect();
    expect(screen.getByText('Pick a fruit')).toBeTruthy();
  });

  it('trigger has combobox role', () => {
    renderSelect();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('combobox');
  });

  it('opens on trigger click', () => {
    renderSelect();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('selects an item on click', () => {
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });
    fireEvent.click(screen.getByTestId('trigger'));
    fireEvent.click(screen.getByTestId('item-apple'));
    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'apple', label: 'Apple' })
    );
  });

  it('items have option role', () => {
    renderSelect({ defaultOpen: true });
    expect(screen.getByTestId('item-apple').getAttribute('role')).toBe('option');
  });

  it('content has list role', () => {
    renderSelect({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('list');
  });

  it('closes after item selection', () => {
    renderSelect();
    fireEvent.click(screen.getByTestId('trigger'));
    fireEvent.click(screen.getByTestId('item-apple'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('shows selected value label', () => {
    renderSelect({ value: { value: 'apple', label: 'Apple' } });
    expect(screen.getByText('Apple')).toBeTruthy();
  });
});
