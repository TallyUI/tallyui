import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { CustomerCard } from '../customer/customer-card';
import { createTestConnector, wooCustomerDoc } from './helpers';

describe('CustomerCard', () => {
  it('renders the customer name', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CustomerCard doc={wooCustomerDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Jane Smith')).toBeDefined();
  });

  it('renders the customer email', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CustomerCard doc={wooCustomerDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('jane@example.com')).toBeDefined();
  });

  it('renders the address summary', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CustomerCard doc={wooCustomerDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('123 Main St, Springfield, IL')).toBeDefined();
  });

  it('renders gracefully with empty doc', () => {
    const connector = createTestConnector('woo');
    const { container } = render(
      <ConnectorProvider connector={connector}>
        <CustomerCard doc={{}} />
      </ConnectorProvider>
    );
    expect(container).toBeDefined();
  });
});
