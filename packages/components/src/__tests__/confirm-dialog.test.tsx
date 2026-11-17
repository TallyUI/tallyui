import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Text } from '../ui/text';

afterEach(cleanup);

const props = { testID: 'del', title: 'Delete it?', description: 'This cannot be undone.', confirmLabel: 'Delete' };

it('opens from its trigger; Cancel closes without confirming', () => {
  const onConfirm = vi.fn();
  render(<><ConfirmDialog {...props} onConfirm={onConfirm} trigger={<Button testID="open"><Text>Delete</Text></Button>} /><PortalHost /></>);
  expect(screen.queryByTestId('del')).toBeNull();
  fireEvent.click(screen.getByTestId('open'));
  expect(screen.getByTestId('del').textContent).toContain('Delete it?');
  expect(screen.getByTestId('del').textContent).toContain('This cannot be undone.');
  expect(screen.getByTestId('del-cancel').textContent).toBe('Cancel');
  fireEvent.click(screen.getByTestId('del-cancel'));
  expect(screen.queryByTestId('del')).toBeNull();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('the confirm button calls onConfirm once and closes', () => {
  const onConfirm = vi.fn();
  render(<><ConfirmDialog {...props} onConfirm={onConfirm} trigger={<Button testID="open"><Text>Delete</Text></Button>} /><PortalHost /></>);
  fireEvent.click(screen.getByTestId('open'));
  fireEvent.click(screen.getByTestId('del-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('del')).toBeNull();
});

it('controlled: open shows it without a trigger, and both buttons ask to close', () => {
  const onConfirm = vi.fn(), onOpenChange = vi.fn();
  const { rerender } = render(<><ConfirmDialog {...props} open onConfirm={onConfirm} onOpenChange={onOpenChange} /><PortalHost /></>);
  expect(screen.getByTestId('del')).toBeTruthy();
  fireEvent.click(screen.getByTestId('del-cancel'));
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(onConfirm).not.toHaveBeenCalled();
  rerender(<><ConfirmDialog {...props} open={false} onConfirm={onConfirm} onOpenChange={onOpenChange} /><PortalHost /></>);
  expect(screen.queryByTestId('del')).toBeNull();
  rerender(<><ConfirmDialog {...props} open onConfirm={onConfirm} onOpenChange={onOpenChange} /><PortalHost /></>);
  fireEvent.click(screen.getByTestId('del-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it('labels and test ids', () => {
  render(<><ConfirmDialog {...props} description={undefined} open onConfirm={vi.fn()} cancelLabel="Keep" cancelTestID="keep" confirmTestID="go" tone="default" /><PortalHost /></>);
  expect(screen.getByTestId('keep').textContent).toBe('Keep');
  expect(screen.getByTestId('go').textContent).toBe(props.confirmLabel);
  expect(screen.queryByTestId('del-cancel')).toBeNull();
  expect(screen.queryByTestId('del-confirm')).toBeNull();
});
