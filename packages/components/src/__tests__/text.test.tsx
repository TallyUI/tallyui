import { cleanup, render } from '@testing-library/react';
import type { TextProps } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAX_FONT_SCALE } from '@tallyui/theme';
import { Text } from '../ui/text';

const calls: TextProps[] = [];
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  Text: (props: TextProps) => { calls.push(props); return null; },
}));

beforeEach(() => { calls.length = 0; });
afterEach(() => { cleanup(); });

it('caps the OS text multiplier at MAX_FONT_SCALE by default', () => {
  render(<Text>Total</Text>);
  expect(calls[calls.length - 1].maxFontSizeMultiplier).toBe(MAX_FONT_SCALE);
});

it('lets a caller override the cap', () => {
  render(<Text maxFontSizeMultiplier={2}>Total</Text>);
  expect(calls[calls.length - 1].maxFontSizeMultiplier).toBe(2);
});
