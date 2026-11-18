import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Select from '../select';
import * as Dialog from '../dialog';
import { PortalHost } from '../portal';

describe('Select', () => {
  const renderSelect = (props = {}, contentProps = {}) =>
    render(
      <div>
        <PortalHost />
        <Select.Root {...props}>
          <Select.Trigger testID="trigger">
            <Select.Value testID="value" placeholder="Pick a fruit" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content testID="content" {...contentProps}>
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

  it('on web measures the trigger with measureInWindow, not measure', () => {
    renderSelect();
    const trigger = screen.getByTestId('trigger');
    const measure = vi.fn();
    const measureInWindow = vi.fn();
    Object.assign(trigger, { measure, measureInWindow });
    fireEvent.click(trigger);
    expect(measureInWindow).toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  describe('Escape', () => {
    it('S1: Escape closes an open Select', () => {
      const onOpenChange = vi.fn();
      renderSelect({ defaultOpen: true, onOpenChange });
      expect(screen.getByTestId('content')).toBeTruthy();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByTestId('content')).toBeNull();
    });

    it('S2: onEscapeKeyDown can keep it open', () => {
      const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
      renderSelect({ defaultOpen: true }, { onEscapeKeyDown });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByTestId('content')).toBeTruthy();
      expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
    });

    it('S3: Escape on a closed Select does nothing', () => {
      const onOpenChange = vi.fn();
      renderSelect({ onOpenChange });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('S4: a Select inside a Dialog closes first, then the Dialog', () => {
      render(
        <div>
          <PortalHost />
          <Dialog.Root defaultOpen>
            <Dialog.Portal>
              <Dialog.Content testID="dialog-content">
                <Select.Root>
                  <Select.Trigger testID="trigger">
                    <Select.Value placeholder="Pick a fruit" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content testID="content">
                      <Select.Item value="apple" label="Apple">
                        <Select.ItemText />
                      </Select.Item>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      );
      fireEvent.click(screen.getByTestId('trigger'));
      expect(screen.getByTestId('content')).toBeTruthy();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('content')).toBeNull();
      expect(screen.getByTestId('dialog-content')).toBeTruthy();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('dialog-content')).toBeNull();
    });

    it('S5: Escape fired inside the Select content closes only the Select', () => {
      render(
        <div>
          <PortalHost />
          <Dialog.Root defaultOpen>
            <Dialog.Portal>
              <Dialog.Content testID="dialog-content">
                <Select.Root defaultOpen>
                  <Select.Trigger testID="trigger">
                    <Select.Value placeholder="Pick a fruit" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content testID="content">
                      <Select.Item value="apple" label="Apple" testID="item-apple">
                        <Select.ItemText />
                      </Select.Item>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      );
      expect(screen.getByTestId('content')).toBeTruthy();
      fireEvent.keyDown(screen.getByTestId('item-apple'), { key: 'Escape' });
      expect(screen.queryByTestId('content')).toBeNull();
      expect(screen.getByTestId('dialog-content')).toBeTruthy();
    });

    it('S6: a closed force-mounted Select after an open Dialog does not take its Escape', () => {
      render(
        <div>
          <PortalHost />
          <Dialog.Root defaultOpen>
            <Dialog.Portal>
              <Dialog.Content testID="dialog-content" />
            </Dialog.Portal>
          </Dialog.Root>
          <Select.Root>
            <Select.Trigger testID="trigger">
              <Select.Value placeholder="Pick a fruit" />
            </Select.Trigger>
            <Select.Portal forceMount>
              <Select.Content testID="content" forceMount>
                <Select.Item value="apple" label="Apple">
                  <Select.ItemText />
                </Select.Item>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      );
      expect(screen.getByTestId('content')).toBeTruthy();
      expect(screen.getByTestId('dialog-content')).toBeTruthy();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByTestId('dialog-content')).toBeNull();
    });
  });
});
