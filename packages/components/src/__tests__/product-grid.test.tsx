import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { ProductGrid } from '../product/product-grid';
import { createTestConnector, wooDoc } from './helpers';

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
});
