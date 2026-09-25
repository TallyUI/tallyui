import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { CartPanel } from '../cart/cart-panel';

const items = [{ name: 'Coffee' }, { name: 'Grinder' }];

function commonAncestor(a: Element, b: Element): Element | null {
  const ancestors = new Set<Element>();
  for (let el: Element | null = a; el; el = el.parentElement) ancestors.add(el);
  for (let el: Element | null = b; el; el = el.parentElement) if (ancestors.has(el)) return el;
  return null;
}

describe('CartPanel', () => {
  it('renders generic items with their indices', () => {
    render(<CartPanel items={items} renderItem={(item, index) => <Text>{index}: {item.name}</Text>} />);
    expect(screen.getByText('0: Coffee')).toBeDefined();
    expect(screen.getByText('1: Grinder')).toBeDefined();
  });

  it('renders header and footer slots', () => {
    render(
      <CartPanel
        items={items}
        renderItem={(item) => <Text>{item.name}</Text>}
        header={<Text>Customer: Jane</Text>}
        footer={<Text>Total: €17.00</Text>}
      />
    );
    expect(screen.getByText('Customer: Jane')).toBeDefined();
    expect(screen.getByText('Total: €17.00')).toBeDefined();
  });

  it('renders emptyState when no items', () => {
    render(<CartPanel items={[]} renderItem={() => null} emptyState={<Text>Cart is empty</Text>} />);
    expect(screen.getByText('Cart is empty')).toBeDefined();
  });

  it('renders afterItems after the lines and inside the scrolling region', () => {
    render(
      <CartPanel
        items={items}
        renderItem={(item) => <Text>{item.name}</Text>}
        afterItems={<Text>Discount chips</Text>}
        footer={<Text>Total: €17.00</Text>}
      />
    );
    const coffee = screen.getByText('Coffee');
    const grinder = screen.getByText('Grinder');
    const afterItems = screen.getByText('Discount chips');
    const footer = screen.getByText('Total: €17.00');

    // afterItems and the lines share an ancestor (the scroll region) that
    // does not also contain the footer, which is pinned outside it.
    const scrollRegion = commonAncestor(coffee, afterItems);
    expect(scrollRegion?.contains(grinder)).toBe(true);
    expect(scrollRegion?.contains(footer)).toBe(false);

    // afterItems comes after both lines in document order.
    expect(coffee.compareDocumentPosition(afterItems) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grinder.compareDocumentPosition(afterItems) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders afterItems even when there are no items', () => {
    render(<CartPanel items={[]} renderItem={() => null} afterItems={<Text>Discount chips</Text>} />);
    expect(screen.getByText('Discount chips')).toBeDefined();
  });
});

describe('CartPanel row identity across removals', () => {
  /** A row with its own local text state, like medusapos's per-line discount form. */
  function Row({ item }: { item: { name: string } }) {
    const [note, setNote] = useState('');
    return (
      <View>
        <Text>{item.name}</Text>
        <TextInput placeholder={`note-${item.name}`} value={note} onChangeText={setNote} />
      </View>
    );
  }

  const lines = [
    { id: 'a', name: 'Coffee' },
    { id: 'b', name: 'Grinder' },
    { id: 'c', name: 'Filters' },
  ];

  it('items with an id keep a row\'s typed input across a removal above it, with no keyExtractor (default keys by id)', () => {
    const { rerender } = render(<CartPanel items={lines} renderItem={(item) => <Row item={item} />} />);
    fireEvent.change(screen.getByPlaceholderText('note-Filters'), { target: { value: 'rush' } });
    expect((screen.getByPlaceholderText('note-Filters') as HTMLInputElement).value).toBe('rush');

    rerender(<CartPanel items={lines.slice(1)} renderItem={(item) => <Row item={item} />} />);

    expect((screen.getByPlaceholderText('note-Filters') as HTMLInputElement).value).toBe('rush');
  });

  it('an explicit keyExtractor still works, keeping input identity even for items without id', () => {
    const anon = lines.map(({ name }) => ({ name }));
    const { rerender } = render(
      <CartPanel items={anon} renderItem={(item) => <Row item={item} />} keyExtractor={(item) => item.name} />
    );
    fireEvent.change(screen.getByPlaceholderText('note-Filters'), { target: { value: 'rush' } });

    rerender(
      <CartPanel items={anon.slice(1)} renderItem={(item) => <Row item={item} />} keyExtractor={(item) => item.name} />
    );

    expect((screen.getByPlaceholderText('note-Filters') as HTMLInputElement).value).toBe('rush');
  });

  it('items without an id fall back to the index, so a removal above shifts typed input onto the wrong row — this is why keying by id/keyExtractor exists', () => {
    const anon = lines.map(({ name }) => ({ name }));
    const { rerender } = render(<CartPanel items={anon} renderItem={(item) => <Row item={item} />} />);
    fireEvent.change(screen.getByPlaceholderText('note-Filters'), { target: { value: 'rush' } });

    rerender(<CartPanel items={anon.slice(1)} renderItem={(item) => <Row item={item} />} />);

    // Filters was at index 2; after removing the first item it renders at
    // index 1, reusing the React identity (and empty state) that used to
    // belong to Grinder at index 1, instead of keeping "rush".
    expect((screen.getByPlaceholderText('note-Filters') as HTMLInputElement).value).toBe('');
  });
});
