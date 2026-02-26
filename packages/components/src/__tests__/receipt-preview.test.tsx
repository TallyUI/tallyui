import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ReceiptPreview } from '../checkout/receipt-preview';

describe('ReceiptPreview', () => {
  const items = [
    { name: 'Widget', quantity: 2, total: '20.00' },
    { name: 'Gadget', quantity: 1, total: '15.00' },
  ];

  it('renders line items', () => {
    render(<ReceiptPreview items={items} subtotal="35.00" tax="3.50" total="38.50" />);
    expect(screen.getByText('Widget x2')).toBeDefined();
    expect(screen.getByText('Gadget x1')).toBeDefined();
  });

  it('renders totals', () => {
    render(<ReceiptPreview items={items} subtotal="35.00" tax="3.50" total="38.50" />);
    expect(screen.getByText('35.00')).toBeDefined();
    expect(screen.getByText('3.50')).toBeDefined();
    expect(screen.getByText('38.50')).toBeDefined();
  });

  it('renders header and footer slots', () => {
    render(
      <ReceiptPreview
        items={items}
        subtotal="35.00"
        tax="3.50"
        total="38.50"
        headerSlot={<Text>My Store</Text>}
        footerSlot={<Text>Thank you!</Text>}
      />,
    );
    expect(screen.getByText('My Store')).toBeDefined();
    expect(screen.getByText('Thank you!')).toBeDefined();
  });
});
