import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterChip, FilterChipGroup } from '../input/filter-chip';

describe('FilterChip', () => {
  it('renders the label', () => {
    render(<FilterChip label="Equipment" active={false} onPress={() => {}} />);
    expect(screen.getByText('Equipment')).toBeDefined();
  });

  it('calls onPress when tapped', () => {
    const onPress = vi.fn();
    render(<FilterChip label="Equipment" active={false} onPress={onPress} />);
    fireEvent.click(screen.getByText('Equipment'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('FilterChipGroup', () => {
  it('renders multiple chips', () => {
    const chips = [
      { label: 'Equipment', active: true },
      { label: 'Accessories', active: false },
    ];
    render(<FilterChipGroup chips={chips} onChipPress={() => {}} />);
    expect(screen.getByText('Equipment')).toBeDefined();
    expect(screen.getByText('Accessories')).toBeDefined();
  });

  it('calls onChipPress with the chip index', () => {
    const onChipPress = vi.fn();
    const chips = [
      { label: 'Equipment', active: false },
      { label: 'Accessories', active: false },
    ];
    render(<FilterChipGroup chips={chips} onChipPress={onChipPress} />);
    fireEvent.click(screen.getByText('Accessories'));
    expect(onChipPress).toHaveBeenCalledWith(1);
  });
});
