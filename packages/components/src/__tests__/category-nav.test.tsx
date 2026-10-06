import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryNav } from '../product/category-nav';

describe('CategoryNav', () => {
  const categories = [
    { id: 'all', name: 'All' },
    { id: 'clothing', name: 'Clothing' },
    { id: 'electronics', name: 'Electronics' },
  ];

  it('renders all categories', () => {
    render(<CategoryNav categories={categories} selectedId="all" onSelect={() => {}} />);
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('Clothing')).toBeDefined();
    expect(screen.getByText('Electronics')).toBeDefined();
  });

  it('calls onSelect with category id', () => {
    const onSelect = vi.fn();
    render(<CategoryNav categories={categories} selectedId="all" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Clothing'));
    expect(onSelect).toHaveBeenCalledWith('clothing');
  });

  it('exposes the selected chip and uses rectangular corners', () => {
    render(<CategoryNav categories={categories} selectedId="clothing" onSelect={() => {}} />);
    const selected = screen.getByTestId('category-nav-clothing');
    expect(selected.getAttribute('role')).toBe('radio');
    expect(selected.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('category-nav-all').getAttribute('aria-checked')).toBe('false');
    expect(selected.className).toContain('rounded-md');
    expect(selected.className).not.toContain('rounded-full');
  });

  it('labels the chip group as Categories', () => {
    const { unmount } = render(<CategoryNav categories={categories} selectedId="all" onSelect={() => {}} orientation="vertical" />);
    expect(screen.getByRole('radiogroup', { name: 'Categories' })).toBeDefined();
    unmount();
    render(<CategoryNav categories={categories} selectedId="all" onSelect={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Categories' })).toBeDefined();
  });
});
