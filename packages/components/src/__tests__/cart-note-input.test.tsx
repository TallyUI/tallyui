import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartNoteInput } from '../cart/cart-note-input';

describe('CartNoteInput', () => {
  it('renders collapsed by default showing "Add customer note" button', () => {
    render(<CartNoteInput value="" onChangeText={() => {}} />);
    expect(screen.getByText('Add customer note')).toBeDefined();
  });

  it('expands on button press', () => {
    render(<CartNoteInput value="" onChangeText={() => {}} />);
    fireEvent.click(screen.getByText('Add customer note'));
    expect(screen.getByPlaceholderText('Customer note')).toBeDefined();
  });

  it('shows expanded when value is non-empty', () => {
    render(<CartNoteInput value="Rush order" onChangeText={() => {}} />);
    expect(screen.getByDisplayValue('Rush order')).toBeDefined();
  });

  it('names the link, placeholder and accessibility label from label', () => {
    render(<CartNoteInput value="" onChangeText={() => {}} label="Kitchen note" />);
    fireEvent.click(screen.getByText('Add kitchen note'));
    expect(screen.getByPlaceholderText('Kitchen note')).toBeDefined();
    expect(screen.getByLabelText('Kitchen note')).toBeDefined();
  });

  it('keeps a given placeholder and the default link text', () => {
    render(<CartNoteInput value="" onChangeText={() => {}} placeholder="Type here" />);
    fireEvent.click(screen.getByText('Add customer note'));
    expect(screen.getByPlaceholderText('Type here')).toBeDefined();
  });
});
