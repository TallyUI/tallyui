import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import { OrderNoteSheet } from '../sale/order-note-sheet';

afterEach(cleanup);

describe('OrderNoteSheet', () => {
  it('shows Order details with the Customer note field', () => {
    render(<><OrderNoteSheet value="Gift wrap" onChangeText={vi.fn()} onOpenChange={vi.fn()} /><PortalHost /></>);
    expect(screen.getByText('Order details')).toBeTruthy();
    const field = screen.getByRole('textbox', { name: 'Customer note' }) as HTMLTextAreaElement;
    expect(field.placeholder).toBe('Add customer note');
    expect(field.value).toBe('Gift wrap');
  });

  it('calls onChangeText on every edit, untrimmed', () => {
    const onChangeText = vi.fn();
    render(<><OrderNoteSheet value="" onChangeText={onChangeText} onOpenChange={vi.fn()} /><PortalHost /></>);
    const field = screen.getByRole('textbox', { name: 'Customer note' });
    fireEvent.change(field, { target: { value: '  Gift' } });
    fireEvent.change(field, { target: { value: '  Gift wrap ' } });
    expect(onChangeText.mock.calls).toEqual([['  Gift'], ['  Gift wrap ']]);
  });

  it('Close closes', () => {
    const onOpenChange = vi.fn();
    render(<><OrderNoteSheet value="" onChangeText={vi.fn()} onOpenChange={onOpenChange} /><PortalHost /></>);
    fireEvent.click(screen.getByTestId('order-note-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("takes the platform's label", () => {
    render(<><OrderNoteSheet value="" onChangeText={vi.fn()} onOpenChange={vi.fn()} label="Order note" /><PortalHost /></>);
    const field = screen.getByRole('textbox', { name: 'Order note' }) as HTMLTextAreaElement;
    expect(field.placeholder).toBe('Add order note');
  });
});
