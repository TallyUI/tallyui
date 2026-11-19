import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CategoryTile } from '../product/category-tile';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

  it('P1: stacked draws the stack before the face, and an unstacked tile has none', () => {
    const { rerender } = render(<CategoryTile name="Clothing" stacked />);
    const stack = screen.getByTestId('category-tile-stack');
    expect(stack.parentElement?.firstElementChild).toBe(stack);
    expect(stack.compareDocumentPosition(screen.getByTestId('category-tile-fallback')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<CategoryTile name="Clothing" />);
    expect(screen.queryByTestId('category-tile-stack')).toBeNull();
  });

  it('P2: the folder mark is decoration, and the tile is still found by its name alone', () => {
    render(<CategoryTile name="Clothing" mark="folder" />);
    expect(screen.getByTestId('category-tile-mark').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Clothing' })).toBeTruthy();
  });

  it('P3: a photo that fails falls back to the initial, and a new URL is tried again', () => {
    // react-native-web's Image fires onError from its loader's own `new window.Image()`, not from the <img> it
    // renders, so the test keeps the loader's images and fires the error there.
    const loads: HTMLImageElement[] = [];
    vi.stubGlobal('Image', function Image() { const img = document.createElement('img'); loads.push(img); return img; });
    const { rerender } = render(<CategoryTile name="Clothing" imageUrl="https://example.test/broken.jpg" />);
    expect(loads.map((img) => img.src)).toEqual(['https://example.test/broken.jpg']);
    fireEvent.error(loads[0]);
    expect(screen.getByTestId('category-tile-fallback').textContent).toBe('C');
    expect(screen.queryByTestId('category-tile-image')).toBeNull();
    rerender(<CategoryTile name="Clothing" imageUrl="https://example.test/clothing.jpg" />);
    expect(screen.getByTestId('category-tile-image')).toBeTruthy();
    expect(screen.queryByTestId('category-tile-fallback')).toBeNull();
  });
});
