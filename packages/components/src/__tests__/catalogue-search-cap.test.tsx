import * as React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { Catalogue } from '../sale/catalogue';

const dimensions = { width: 1280, height: 800, scale: 1, fontScale: 1 };
// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Pressable: withClass(rn.Pressable), Text: withClass(rn.Text), useWindowDimensions: () => dimensions };
});

afterEach(() => cleanup());

function mount() {
  render(<Catalogue products={[]} traits={wooProductTraits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} showViewToggle />);
}

it.each([
  [1280, 800, true],
  [390, 844, false],
  [844, 390, false],
])('caps the search field at %ix%i: %s', (width, height, capped) => {
  Object.assign(dimensions, { width, height });
  mount();
  expect(screen.getByTestId('catalogue-search').getAttribute('data-class')?.includes('max-w-160')).toBe(capped);
});

it('puts the search before the view toggle in the search row', () => {
  Object.assign(dimensions, { width: 1280, height: 800 });
  mount();
  const row = within(screen.getByTestId('catalogue-search-row'));
  expect(row.getByTestId('catalogue-search').compareDocumentPosition(row.getByTestId('view-toggle')))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});
