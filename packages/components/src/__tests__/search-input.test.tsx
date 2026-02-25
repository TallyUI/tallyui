import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchInput } from '../input/search-input';

describe('SearchInput', () => {
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
