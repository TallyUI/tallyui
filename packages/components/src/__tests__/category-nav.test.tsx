import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  it('exposes the selected chip as a checked radio', () => {
    render(<CategoryNav categories={categories} selectedId="clothing" onSelect={() => {}} />);
    const selected = screen.getByTestId('category-nav-clothing');
    expect(selected.getAttribute('role')).toBe('radio');
    expect(selected.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('category-nav-all').getAttribute('aria-checked')).toBe('false');
  });

  it('draws rectangular chips, not pills', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../product/category-nav.tsx'), 'utf8');
    expect(source).toContain("'rounded-md px-3 py-1.5'");
    expect(source).not.toContain('rounded-full');
  });

  it('labels the chip group as Categories', () => {
    const { unmount } = render(<CategoryNav categories={categories} selectedId="all" onSelect={() => {}} orientation="vertical" />);
    expect(screen.getByRole('radiogroup', { name: 'Categories' })).toBeDefined();
    unmount();
    render(<CategoryNav categories={categories} selectedId="all" onSelect={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Categories' })).toBeDefined();
  });
});
