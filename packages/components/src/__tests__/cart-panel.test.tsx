import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { CartPanel } from '../cart/cart-panel';
import { CartLine } from '../cart/cart-line';
import { createTestConnector, wooDoc } from './helpers';

describe('CartPanel', () => {
  const items = [
    { doc: wooDoc, quantity: 2 },
    { doc: { ...wooDoc, id: 2, name: 'Grinder', price: '199.99' }, quantity: 1 },
  ];

  it('renders cart line items', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartPanel items={items} renderItem={(item) => <CartLine item={item} />} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Espresso Machine Pro')).toBeDefined();
    expect(screen.getByText('Grinder')).toBeDefined();
  });

  it('renders header and footer slots', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartPanel
          items={items}
          renderItem={(item) => <CartLine item={item} />}
          header={<Text>Customer: Jane</Text>}
          footer={<Text>Total: $1399.97</Text>}
        />
      </ConnectorProvider>
    );
    expect(screen.getByText('Customer: Jane')).toBeDefined();
    expect(screen.getByText('Total: $1399.97')).toBeDefined();
  });

  it('renders emptyState when no items', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartPanel
          items={[]}
          renderItem={() => null}
          emptyState={<Text>Cart is empty</Text>}
        />
      </ConnectorProvider>
    );
    expect(screen.getByText('Cart is empty')).toBeDefined();
  });
});
