import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { CustomerSelect } from '../customer/customer-select';
import { createTestConnector, wooCustomerDoc } from './helpers';

describe('CustomerSelect', () => {
  const customers = [
    wooCustomerDoc,
    { ...wooCustomerDoc, id: 2, first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com' },
  ];

  it('renders customer results', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CustomerSelect customers={customers} onSelect={() => {}} onSearch={() => {}} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.getByText('Bob Jones')).toBeDefined();
  });

  it('shows selected customer name', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CustomerSelect customers={[]} selected={wooCustomerDoc} onSelect={() => {}} onSearch={() => {}} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Jane Smith')).toBeDefined();
  });
});
