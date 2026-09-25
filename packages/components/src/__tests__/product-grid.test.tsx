import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { ProductGrid } from '../product/product-grid';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';

describe('ProductGrid', () => {
  it('renders items via renderItem', () => {
    const connector = createTestConnector('woo');
    const items = [{ ...wooDoc, id: 1 }, { ...wooDoc, id: 2, name: 'Grinder Pro' }];
    render(
      <ConnectorProvider connector={connector}>
        <ProductGrid
          items={items}
          renderItem={(doc) => <Text key={doc.id}>{doc.name}</Text>}
        />
      </ConnectorProvider>
    );
    expect(screen.getByText('Espresso Machine Pro')).toBeDefined();
    expect(screen.getByText('Grinder Pro')).toBeDefined();
  });

  it('renders emptyState when items is empty', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductGrid
          items={[]}
          renderItem={() => null}
          emptyState={<Text>No products</Text>}
        />
      </ConnectorProvider>
    );
    expect(screen.getByText('No products')).toBeDefined();
  });

  it('hides an unsellable item by default', () => {
    const connector = createTestConnector('medusa');
    const items = [{ ...medusaDoc, id: 'sellable', status: 'published' }, { ...medusaDoc, id: 'unsellable', status: 'draft' }];
    render(
      <ConnectorProvider connector={connector}>
        <ProductGrid items={items} renderItem={(doc) => <Text key={doc.id}>{doc.title}</Text>} />
      </ConnectorProvider>
    );
    expect(screen.getAllByText(medusaDoc.title)).toHaveLength(1);
  });

  it('shows unsellable items when showUnsellable is set', () => {
    const connector = createTestConnector('medusa');
    const items = [{ ...medusaDoc, id: 'sellable', status: 'published' }, { ...medusaDoc, id: 'unsellable', status: 'draft' }];
    render(
      <ConnectorProvider connector={connector}>
        <ProductGrid showUnsellable items={items} renderItem={(doc) => <Text key={doc.id}>{doc.title}</Text>} />
      </ConnectorProvider>
    );
    expect(screen.getAllByText(medusaDoc.title)).toHaveLength(2);
  });

  it('does not filter when there is no connector in context', () => {
    const items = [{ ...medusaDoc, id: 'sellable', status: 'published' }, { ...medusaDoc, id: 'unsellable', status: 'draft' }];
    render(<ProductGrid items={items} renderItem={(doc) => <Text key={doc.id}>{doc.title}</Text>} />);
    expect(screen.getAllByText(medusaDoc.title)).toHaveLength(2);
  });

  it('shows emptyState when every item is filtered out', () => {
    const connector = createTestConnector('medusa');
    const items = [{ ...medusaDoc, id: 'unsellable', status: 'draft' }];
    render(
      <ConnectorProvider connector={connector}>
        <ProductGrid items={items} renderItem={(doc) => <Text key={doc.id}>{doc.title}</Text>} emptyState={<Text>No products</Text>} />
      </ConnectorProvider>
    );
    expect(screen.getByText('No products')).toBeDefined();
  });
});
