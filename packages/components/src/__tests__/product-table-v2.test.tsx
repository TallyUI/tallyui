import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Text, View } from 'react-native';
import { ProductTable, type ProductTableColumn } from '../product/product-table';

// Preserve View class names before react-native-web turns them into hashed classes.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => (
      <Base ref={ref} {...props} dataSet={{ class: props.className }} />
    ));
  return { ...rn, View: withClass(rn.View) };
});

const items = [{ id: 1, name: 'Apple', price: 5 }];
const columns: ProductTableColumn<(typeof items)[number]>[] = [
  { id: 'image', header: 'Image', hideHeader: true, render: () => <View testID="image-cell" /> },
  { id: 'price', header: 'Regular Price', align: 'right', render: (doc) => <Text>{doc.price}</Text>, sortValue: (doc) => doc.price },
  { id: 'name', header: 'Name', render: (doc) => <Text>{doc.name}</Text> },
];
const classes = (el: Element) => (el.getAttribute('data-class') ?? '').split(/\s+/);

afterEach(() => cleanup());

describe('ProductTable v2 columns', () => {
  beforeEach(() => {
    render(<ProductTable items={items} columns={columns} />);
  });

  it('aligns the price head and cell right and leaves unspecified alignment alone', () => {
    const priceHead = screen.getByRole('columnheader', { name: 'Regular Price' });
    const priceCell = screen.getByText('5').closest('[role="cell"]')!;
    expect(classes(priceHead)).toContain('items-end');
    expect(classes(priceCell)).toContain('items-end');
    const nameHead = screen.getByRole('columnheader', { name: 'Name' });
    const nameCell = screen.getByText('Apple').closest('[role="cell"]')!;
    for (const el of [nameHead, nameCell]) {
      for (const alignment of ['items-start', 'items-center', 'items-end']) {
        expect(classes(el)).not.toContain(alignment);
      }
    }
  });

  it('keeps the head label on one line', () => {
    const label = screen.getByText('Regular Price');
    expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
    expect(getComputedStyle(label).whiteSpace).toBe('nowrap');
  });

  it('uses v2 head height and padding and cell padding', () => {
    for (const head of screen.getAllByRole('columnheader')) {
      expect(classes(head)).toEqual(expect.arrayContaining(['h-9', 'px-3', 'py-0']));
      expect(classes(head)).not.toContain('px-4');
      expect(classes(head)).not.toContain('py-3');
    }
    for (const cell of screen.getAllByRole('cell')) {
      expect(classes(cell)).toEqual(expect.arrayContaining(['px-3', 'py-1.5']));
      expect(classes(cell)).not.toContain('px-4');
      expect(classes(cell)).not.toContain('py-4');
    }
  });

  it('hides the image label while preserving accessible head and sort names', () => {
    expect(screen.getByRole('columnheader', { name: 'Image' }).textContent).toBe('');
    expect(screen.getByRole('columnheader', { name: 'Name' }).hasAttribute('aria-label')).toBe(false);
    expect(screen.getByRole('button', { name: 'Sort by Regular Price' }).getAttribute('aria-label'))
      .toBe('Sort by Regular Price');
  });
});
