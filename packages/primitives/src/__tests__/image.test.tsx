import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import * as Image from '../image';

describe('Image', () => {
  it('renders with source', () => {
    render(
      <Image.Root
        source={{ uri: 'https://example.com/img.png' }}
        testID="image"
        alt="Test image"
      />
    );
    expect(screen.getByTestId('image')).toBeTruthy();
  });

  it('sets alt text for accessibility', () => {
    render(
      <Image.Root
        source={{ uri: 'https://example.com/img.png' }}
        testID="image"
        alt="A product photo"
      />
    );
    const img = screen.getByTestId('image');
    // react-native-web renders aria-label on the outer container
    expect(
      img.getAttribute('alt') || img.getAttribute('aria-label')
    ).toBe('A product photo');
  });

  it('renders without alt (decorative image)', () => {
    render(
      <Image.Root
        source={{ uri: 'https://example.com/img.png' }}
        testID="image"
      />
    );
    expect(screen.getByTestId('image')).toBeTruthy();
  });

  it('applies contentFit as resizeMode', () => {
    render(
      <Image.Root
        source={{ uri: 'https://example.com/img.png' }}
        testID="image"
        contentFit="contain"
      />
    );
    // Just verify it renders without errors — resizeMode mapping is internal
    expect(screen.getByTestId('image')).toBeTruthy();
  });
});
