import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CategoryTile } from '../product/category-tile';

afterEach(() => cleanup());

describe('CategoryTile', () => {
  it('renders the category photo', () => {
    const onPress = vi.fn();
    const { container } = render(<CategoryTile name="Clothing" imageUrl="https://example.test/clothing.jpg" count={12} onPress={onPress} />);
    expect(screen.getByTestId('category-tile-image')).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/clothing.jpg');
    expect(screen.queryByTestId('category-tile-fallback')).toBeNull();
    expect(screen.getByText('Clothing')).toBeTruthy();
    expect(screen.getByText('12 products')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clothing' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the fallback initial without a photo', () => {
    const { container } = render(<CategoryTile name="Clothing" />);
    expect(screen.getByTestId('category-tile-fallback').textContent).toBe('C');
    expect(screen.queryByTestId('category-tile-image')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Clothing')).toBeTruthy();
    expect(screen.queryByText(/products?$/)).toBeNull();
  });
});
