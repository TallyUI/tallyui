import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartNoteInput } from '../cart/cart-note-input';

describe('CartNoteInput', () => {
  it('renders collapsed by default showing "Add note" button', () => {
    render(<CartNoteInput value="" onChangeText={() => {}} />);
    expect(screen.getByText('Add note')).toBeDefined();
  });

  it('expands on button press', () => {
    render(<CartNoteInput value="" onChangeText={() => {}} />);
    fireEvent.click(screen.getByText('Add note'));
    expect(screen.getByPlaceholderText('Order note...')).toBeDefined();
  });

  it('shows expanded when value is non-empty', () => {
    render(<CartNoteInput value="Rush order" onChangeText={() => {}} />);
    expect(screen.getByDisplayValue('Rush order')).toBeDefined();
  });
});
