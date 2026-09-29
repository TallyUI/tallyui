import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { CustomerSelect } from '../customer/customer-select';
import { createTestConnector, wooCustomerDoc } from './helpers';
import { fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

describe('CustomerSelect', () => {
  it('uses the traits prop instead of the context', () => {
    const connector = createTestConnector('woo');
    const traits = { ...connector.traits.customer!, getName: () => 'Override name' };
    render(<ConnectorProvider connector={connector}>
      <CustomerSelect customers={[wooCustomerDoc]} traits={traits} onSelect={() => {}} onSearch={() => {}} />
    </ConnectorProvider>);
    expect(screen.getByRole('option', { name: 'Override name' })).toBeDefined();
    expect(screen.getByText('Override name')).toBeDefined();
    expect(screen.queryByText('Jane Smith')).toBeNull();
  });

  it('pressing a result row calls onSelect with that customer', () => {
    const onSelect = vi.fn();
    render(<ConnectorProvider connector={createTestConnector('woo')}>
      <CustomerSelect customers={[wooCustomerDoc]} onSelect={onSelect} onSearch={() => {}} />
    </ConnectorProvider>);
    fireEvent.click(screen.getByRole('option', { name: 'Jane Smith' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(wooCustomerDoc);
  });

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
