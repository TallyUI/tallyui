import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { CustomerSelect } from '../customer/customer-select';
import { createTestConnector, wooCustomerDoc } from './helpers';

describe('CustomerSelect', () => {
  it('uses the traits prop instead of the context', () => {
    const connector = createTestConnector('woo');
    const traits = { ...connector.traits.customer!, getName: () => 'Override name' };
    render(<ConnectorProvider connector={connector}>
      <CustomerSelect customers={[wooCustomerDoc]} traits={traits} onSelect={() => {}} onSearch={() => {}} />
    </ConnectorProvider>);
    expect(screen.getByRole('option', { name: 'Override name, jane@example.com' })).toBeDefined();
    expect(screen.getByText('Override name')).toBeDefined();
    expect(screen.queryByText('Jane Smith')).toBeNull();
  });

  it('pressing a result row calls onSelect with that customer', () => {
    const onSelect = vi.fn();
    render(<ConnectorProvider connector={createTestConnector('woo')}>
      <CustomerSelect customers={[wooCustomerDoc]} onSelect={onSelect} onSearch={() => {}} />
    </ConnectorProvider>);
    fireEvent.click(screen.getByRole('option', { name: 'Jane Smith, jane@example.com' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(wooCustomerDoc);
  });

  it("a row's accessible name has the name and email", () => {
    render(<ConnectorProvider connector={createTestConnector('woo')}>
      <CustomerSelect customers={[wooCustomerDoc, { ...wooCustomerDoc, id: 2, first_name: 'Bob', email: '' }]} onSelect={() => {}} onSearch={() => {}} />
    </ConnectorProvider>);
    expect(screen.getByRole('option', { name: 'Jane Smith, jane@example.com' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Bob Smith' })).toBeDefined();
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
