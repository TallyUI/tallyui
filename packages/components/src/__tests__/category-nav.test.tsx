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
});
