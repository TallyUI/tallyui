import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartColumnHeads, cartColumnIds, cartColumnSlots } from '../cart/cart-columns';
import { CartLine } from '../cart/cart-line';
import { CartChargeLine } from '../cart/cart-charge-line';
import { I18nProvider } from '../i18n';

const eur = (amount: number) => ({ amount, currency: 'EUR' });
const heads = () => screen.getAllByRole('columnheader').map((head) => head.textContent);
const line = { name: 'Coffee', quantity: 1, unitPrice: eur(1000), lineTotal: eur(1000), locale: 'en' };

describe('cartColumnIds order', () => {
  it('C1: puts the listed ids first, then the rest in the default order', () => {
    expect(cartColumnIds({ order: ['total', 'quantity'] })).toEqual(['total', 'quantity', 'name', 'price']);
  });

  it('C2: ignores unknown and repeated ids', () => {
    expect(cartColumnIds({ order: ['price', 'nope' as never, 'price', 'quantity'] })).toEqual(['price', 'quantity', 'name', 'total']);
  });

  it('C3: the Price fold drops Price but keeps Regular Price', () => {
    expect(cartColumnIds({ regularPrice: { show: true } }, { showPrice: false })).toEqual(['quantity', 'name', 'regularPrice', 'total']);
  });
});

describe('cartColumnSlots order', () => {
  it("C4: puts the fill where the hidden name sits in the order", () => {
    expect(cartColumnSlots({ name: { show: false }, order: ['name', 'total'] })).toEqual(['fill', 'total', 'quantity', 'price']);
    expect(cartColumnSlots({ name: { show: false } })).toEqual(['quantity', 'fill', 'price', 'total']);
  });
});

describe('CartColumnHeads order and catalogue', () => {
  const columns = { sku: { show: true }, regularPrice: { show: true }, order: ['total'] as const };

  it('C5: heads the columns in the given order, with SKU and Regular Price', () => {
    render(<CartColumnHeads columns={columns} />);
    expect(heads()).toEqual(['Total', 'Qty', 'Item', 'SKU', 'Price', 'Regular Price']);
  });

  it('C5: reads the SKU and Regular Price heads from the catalogue', () => {
    const fr = {
      'common.sku': 'UGS', 'common.regular_price': 'Prix normal',
      'pos_cart.col_qty': 'Qté', 'pos_cart.col_item': 'Article', 'pos_cart.col_price': 'Prix', 'pos_cart.col_total': 'Total',
    };
    render(<I18nProvider locale="fr" resources={{ fr }}><CartColumnHeads columns={columns} /></I18nProvider>);
    expect(heads()).toEqual(['Total', 'Qté', 'Article', 'UGS', 'Prix', 'Prix normal']);
  });
});

describe('CartLine price columns', () => {
  it('C6: price.onSale false hides the struck regular price', () => {
    const { rerender } = render(<CartLine {...line} regularUnitPrice={eur(1250)} columns={{ price: { onSale: false } }} />);
    expect(screen.queryByLabelText(/^Regular price/)).toBeNull();
    rerender(<CartLine {...line} regularUnitPrice={eur(1250)} />);
    expect(screen.getByLabelText('Regular price €12.50')).toBeDefined();
  });

  it('C7: the Regular Price column shows the regular price, else the unit price', () => {
    const columns = { regularPrice: { show: true } };
    const { rerender } = render(<CartLine {...line} regularUnitPrice={eur(1250)} columns={columns} />);
    expect(screen.getByTestId('cart-line-regular-price').textContent).toBe('€12.50');
    rerender(<CartLine {...line} columns={columns} />);
    expect(screen.getByTestId('cart-line-regular-price').textContent).toBe('€10.00');
  });
});

describe('CartLine Split catalogue', () => {
  it('C8: reads the Split text and label from the catalogue', () => {
    const fr = { 'pos_cart.split_qty': 'Diviser', 'pos_cart.split_line': 'Diviser {name}' };
    render(<I18nProvider locale="fr" resources={{ fr }}>
      <CartLine {...line} quantity={3} lineTotal={eur(3000)} columns={{ quantity: { split: true } }} onSplit={() => {}} />
    </I18nProvider>);
    expect(screen.getByText('Diviser')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Diviser Coffee' })).toBeDefined();
  });
});

describe('charge line columns', () => {
  it('C9: a charge line has as many cells as a cart line, Regular Price included', () => {
    const columns = { regularPrice: { show: true }, order: ['total'] as const };
    render(<>
      <CartLine {...line} columns={columns} testID="row-line" />
      <CartChargeLine name="Delivery" price={eur(500)} total={eur(500)} locale="en" columns={columns} testID="row-charge" />
    </>);
    expect(screen.getByTestId('row-line').children).toHaveLength(5);
    expect(screen.getByTestId('row-charge').children).toHaveLength(5);
  });
});
