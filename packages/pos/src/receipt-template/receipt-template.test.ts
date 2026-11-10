import { describe, expect, it } from 'vitest';
import type { ReceiptData } from '../receipt/types';
import { parseXml, renderLogiclessTemplate, renderReceiptHtml, renderThermalPreview, sanitizeHtml } from './index';

const fixture: ReceiptData = {
  schemaVersion: '1.4.0',
  software: { name: 'TallyUI', plugin_version: '', app_version: '3.12.0', app_build: '', platform: 'web' },
  currency: 'EUR',
  header: { storeName: 'Corner Cafe', orderNumber: 'ord-1001', date: '2026-11-10T09:30:00.000Z', cashier: 'Sam' },
  register: { id: 'front', name: 'Front till' },
  fiscal: { document_type: 'sale', is_reprint: false, reprint_count: 0, qr_payload: '' },
  lineItems: [
    {
      name: 'Espresso', sku: 'ESP', quantity: 2, unitPriceMinor: 450, attributes: { Size: 'Large' },
      displayAmountMinor: 900, displayDiscounts: [{ label: 'Happy hour', amountMinor: 100 }], lineTotalMinor: 760,
    },
    {
      name: 'Muffin', sku: 'MUF', quantity: 1, unitPriceMinor: 300,
      displayAmountMinor: 300, displayDiscounts: [], lineTotalMinor: 290,
    },
  ],
  fees: [],
  shipping: [],
  discounts: [],
  orderDiscountMinor: 50,
  totals: {
    taxInclusive: false, subtotalMinor: 1200, discountMinor: 150,
    taxLines: [{ label: 'VAT 10%', ratePpm: 100000, amountMinor: 105 }], taxMinor: 105, totalMinor: 1155,
  },
  payments: [{ method: 'cash', amountMinor: 2000 }],
  changeDueMinor: 845,
  footer: {},
};

const options = {
  formatMoney: (m: number, c: string) => `${c} ${(m / 100).toFixed(2)}`,
  formatDate: (iso: string) => iso.slice(0, 10),
};

function rows(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('[style*="display: flex"]')).map((row) =>
    Array.from(row.children).map((child) => (child.textContent ?? '').trim()).join(' | '));
}

describe('receipt templates', () => {
  it('renders the key lines of an 80 mm receipt', () => {
    const html = renderReceiptHtml(fixture, options);
    for (const text of ['width: 48ch', 'Corner Cafe', 'Receipt', 'Espresso', 'Size: Large', 'Muffin', 'Thank you']) {
      expect(html).toContain(text);
    }
    const renderedRows = rows(html);
    for (const row of [
      'Order | ord-1001', 'Date | 2026-11-10', 'Cashier | Sam', 'Register | Front till',
      '2 × EUR 4.50 | EUR 9.00', 'Happy hour | −EUR 1.00', '1 × EUR 3.00 | EUR 3.00',
      'Subtotal | EUR 12.00', 'Line discounts | −EUR 1.00', 'Order discount | −EUR 0.50',
      'VAT 10% | EUR 1.05', 'Total | EUR 11.55', 'Cash | EUR 20.00', 'Change | EUR 8.45',
    ]) {
      expect(renderedRows).toContain(row);
    }
    expect(renderedRows.some((row) => row.startsWith('Customer'))).toBe(false);
  });

  it('renders the 58 mm template at 32 characters', () => {
    const html = renderReceiptHtml(fixture, { ...options, paper: '58mm' });
    expect(html).toContain('width: 32ch');
    expect(rows(html)).toContain('Total | EUR 11.55');
  });

  it('prints a missing field as empty, never undefined', () => {
    expect(renderThermalPreview('<receipt><text>[{{customer.name}}]</text></receipt>', {})).toContain('[]');
    const withoutCashier: ReceiptData = {
      ...fixture, header: { ...fixture.header }, register: { ...fixture.register, name: '' },
    };
    delete withoutCashier.header.cashier;
    const html = renderReceiptHtml(withoutCashier, options);
    expect(html).not.toContain('undefined');
    expect(rows(html).some((row) => row.startsWith('Cashier') || row.startsWith('Register'))).toBe(false);
  });

  it('escapes data in a logicless template', () => {
    const html = renderLogiclessTemplate('<p>{{name}}</p>', { name: '<script>x</script>' });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script');
  });

  it('strips a script and an on* attribute', () => {
    const html = sanitizeHtml(
      '<p onclick="steal()">Hi</p><script>alert(1)</script><img src="javascript:alert(1)">',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<p>Hi</p>');
  });

  it('renders a QR payload as a pending placeholder', () => {
    const html = renderReceiptHtml({ ...fixture, fiscal: { ...fixture.fiscal, qr_payload: 'QR-DATA' } }, options);
    expect(html).toContain('data-barcode-kind="qrcode"');
    expect(html).toContain('data-barcode-pending="true"');
    expect(html).toContain('QR-DATA');
  });

  it('rejects XML that is not a receipt', () => {
    expect(() => parseXml('<ticket />')).toThrow(/Expected <receipt> root element/);
    expect(() => parseXml('<receipt><text>')).toThrow(/XML parse error/);
  });
});
