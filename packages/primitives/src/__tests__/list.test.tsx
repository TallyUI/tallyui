import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'react-native';
import * as List from '../list';

describe('List', () => {
  const data = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    label: `Item ${i}`,
  }));

  it('renders items using renderItem', () => {
    render(
      <List.Root
        data={data.slice(0, 3)}
        renderItem={({ item }) => (
          <List.Item testID={`item-${item.id}`}>
            <Text>{item.label}</Text>
          </List.Item>
        )}
        estimatedItemSize={50}
      />
    );
    expect(screen.getByTestId('item-0')).toBeTruthy();
    expect(screen.getByTestId('item-1')).toBeTruthy();
    expect(screen.getByTestId('item-2')).toBeTruthy();
  });

  it('renders item text content', () => {
    render(
      <List.Root
        data={[{ id: '1', label: 'Hello World' }]}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        estimatedItemSize={50}
      />
    );
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('uses keyExtractor', () => {
    const keyExtractor = vi.fn((item: { id: string }) => item.id);
    render(
      <List.Root
        data={data.slice(0, 3)}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        keyExtractor={keyExtractor}
        estimatedItemSize={50}
      />
    );
    expect(keyExtractor).toHaveBeenCalled();
  });

  it('renders empty list without errors', () => {
    const { container } = render(
      <List.Root
        data={[]}
        renderItem={({ item }: { item: any }) => <Text>{item.label}</Text>}
        estimatedItemSize={50}
      />
    );
    expect(container).toBeTruthy();
  });
});
