import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchInput } from '../input/search-input';

describe('SearchInput', () => {
  it('renders a searchbox without the old magnifier glyph', () => {
    render(<SearchInput value="" onChangeText={() => {}} />);
    const input = screen.getByRole('searchbox');
    expect(input.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.queryByText('⌕')).toBeNull();
    const icon = document.getElementById(input.getAttribute('aria-labelledby')!);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('removes the inner outline while preserving caller styles', () => {
    render(<SearchInput value="" onChangeText={() => {}} style={{ opacity: 0.5 }} />);
    const style = getComputedStyle(screen.getByRole('searchbox'));
    expect(style.outlineStyle).toBe('none');
    expect(style.opacity).toBe('0.5');
  });

  it('forwards focus and blur events to caller handlers', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(<SearchInput value="" onChangeText={() => {}} onFocus={onFocus} onBlur={onBlur} />);
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onFocus.mock.calls[0][0].type).toBe('focus');
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledOnce();
    expect(onBlur.mock.calls[0][0].type).toBe('blur');
  });

  it('renders with placeholder text', () => {
    render(<SearchInput value="" onChangeText={() => {}} placeholder="Search products..." />);
    expect(screen.getByPlaceholderText('Search products...')).toBeDefined();
  });

  it('displays the current value', () => {
    render(<SearchInput value="espresso" onChangeText={() => {}} />);
    expect(screen.getByDisplayValue('espresso')).toBeDefined();
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = vi.fn();
    render(<SearchInput value="" onChangeText={onChangeText} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'latte' } });
    expect(onChangeText).toHaveBeenCalledWith('latte');
  });
});
