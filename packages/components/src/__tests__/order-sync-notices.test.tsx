// OrderSyncNotices: the per-sale sync notices OrdersList shows under each order, rendered on their own. Every
// expected string is written out here, not imported from the component file (UPDATE_UNSENDABLE_MESSAGE aside, as in
// orders-list.test.tsx).
import { cleanup, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { UPDATE_UNSENDABLE, UPDATE_UNSENDABLE_MESSAGE, type PosOrder } from '@tallyui/pos';
import { OrderSyncNotices } from '../sale/orders-list';

afterEach(() => cleanup());

function order(id: string, overrides: Partial<PosOrder> = {}): PosOrder {
  const createdAt = '2026-09-25T10:00:00.000Z';
  return {
    id, commandId: `command-${id}`, createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: `line-${id}`, productId: 'shirt', variantId: 'blue', name: 'Blue shirt', sku: 'BLUE', quantity: 2,
      unitPriceMinor: 600, discountMinor: 0, netMinor: 1200, taxLines: [] }],
    payments: [{ id: `payment-${id}`, method: 'cash', amountMinor: 1200 }], customer: null,
    subtotalMinor: 1200, discountMinor: 0, taxMinor: 0, totalMinor: 1200, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...overrides,
  };
}
const eur = (amount: number) => formatMoney({ amount, currency: 'EUR' });
const PLATFORM_ERROR = "The online store refused this sale. Ask the store owner to look at the till's sync log.";
const NOTE_NOT_SENT = "The customer note couldn't be sent to the store.";
const noteNotSent = { note: 'Deliver after 5', sentVersion: 6, syncStatus: 'applied' } as const;
const TAX_IDS_NOT_SENT = "The customer's tax IDs couldn't be sent to the store.";
const META_NOT_SENT = "The order's custom fields couldn't be sent to the store.";
const edited = (id: string, name = 'Blue shirt') => ({ id, productId: 'shirt', variantId: id, name, sku: `${id}-NEW`, catalogueSku: id,
  quantity: 1, unitPriceMinor: 600, discountMinor: 0, netMinor: 600, taxLines: [] });
const extras = { customer: { taxIds: [{ type: 'eu_vat', value: 'DE123456789' }] }, meta: [{ key: 'gift', value: 'yes' }], lines: [edited('l1')] };

describe('OrderSyncNotices parked sales', () => {
  it.each([
    ['needs_admin:session_closed', 'Not in the online store yet. A manager must finish this sale in the store admin.'],
    ['needs_admin:compensation_failed', 'Not finished in the online store. A manager must check this sale in the store admin.'],
    ['needs_admin:made_up', 'Not finished in the online store. A manager must check this sale in the store admin.'],
    ['status_503', "Hasn't reached the online store since"],
  ])('shows the stuck line for %s', (reason, expected) => {
    const sale = order('parked');
    const stuck = { commandIds: [sale.commandId], since: 1, reason,
      orders: [{ commandId: sale.commandId, since: 1, reason }] };
    const { container } = render(<OrderSyncNotices order={sale} stuck={stuck} />);
    expect(container.textContent).toContain(expected);
    if (reason !== 'status_503') expect(container.textContent).not.toContain("Hasn't reached");
  });
});

describe('OrderSyncNotices refusals', () => {
  it.each([
    ['invalid_payload', "The online store refused this sale: this till sent it in a form the store can't read. Ask the store owner to look at the till's sync log."],
    ['unsupported_version', "The online store refused this sale: the store's software is older than this till's. Ask the store owner to update the POS plugin."],
    ['idempotency_mismatch', "The online store has a different sale under this sale's number. Don't send it again; ask the store owner to compare the two."],
    ['store_configuration', 'The online store refused this sale: a setting on the store needs changing. Once the store owner fixes it, press Retry.'],
    ['platform_error', PLATFORM_ERROR],
    ['internal_error', "The online store hit a fault in its POS plugin and refused this sale. Ask the store owner to look at the till's sync log."],
    ['insufficient_stock', "The online store refused this sale: it doesn't have enough stock of one of the items."],
    ['unsupported_tax_mode', "The online store refused this sale: its tax settings can't take a sale like this one. Ask the store owner to check them."],
    ['unknown_variant', 'The online store refused this sale: that product variation no longer exists.'],
    ['invalid_quantity', "The online store refused this sale: a quantity or a discount on it isn't allowed."],
    ['underpaid', 'The online store refused this sale: the payments add up to less than the total.'],
    ['unsupported_currency', "The online store refused this sale: the store doesn't take this currency."],
  ])('shows the %s refusal in the cashier\'s words', (code, sentence) => {
    render(<OrderSyncNotices order={order('r', { syncStatus: 'rejected', error: { code, message: 'store message' } })} />);
    expect(screen.getByText(sentence)).toBeTruthy();
  });

  it.each<[string, Partial<PosOrder>]>([
    ['an unknown code', { error: { code: 'no_such_code', message: 'store message' } }],
    ['no error', {}],
  ])('falls back to the platform_error sentence for %s', (_name, overrides) => {
    render(<OrderSyncNotices order={order('r', { syncStatus: 'rejected', ...overrides })} />);
    expect(screen.getByText(PLATFORM_ERROR)).toBeTruthy();
  });

  it('asks to reopen again when a reopened order was changed in the store', () => {
    render(<OrderSyncNotices order={order('r', { syncStatus: 'rejected', storeOrderId: 's1',
      error: { code: 'reopen_required', message: 'store message' } })} />);
    expect(screen.getByText("This order was changed in the online store after it was reopened here, so your change wasn't sent. Reopen the order and make the change again.")).toBeTruthy();
  });

  it('shows the update-unsendable message on a pending order', () => {
    render(<OrderSyncNotices order={order('p', { error: { code: UPDATE_UNSENDABLE, message: 'store message' } })} />);
    expect(screen.getByText(UPDATE_UNSENDABLE_MESSAGE)).toBeTruthy();
  });
});

describe('OrderSyncNotices order left on the store (#1101)', () => {
  const INSUFFICIENT_STOCK = "The online store refused this sale: it doesn't have enough stock of one of the items.";
  const INVALID_PAYLOAD = "The online store refused this sale: this till sent it in a form the store can't read. Ask the store owner to look at the till's sync log.";
  const NOTHING_PAID = 'Order #115 was left pending on the online store. Nothing was paid there.';
  const usd = (amounts: number[]) => ({ currency: 'USD', totalMinor: 1000,
    payments: amounts.map((amountMinor, i) => ({ id: `payment-${i}`, method: 'cash' as const, amountMinor })) });
  const left = (code: string, data: Record<string, unknown> | undefined, extra: Partial<PosOrder> = {}) => order('x', { ...usd([1000]),
    syncStatus: 'rejected', error: { code, message: 'WooCommerce order #115 was created but not paid: Platform says no.', ...(data ? { data } : {}) }, ...extra });

  it.each<[string, PosOrder, string, string]>([
    ['invalid_payload, recorded absent, 1 payment', left('invalid_payload', { orderId: '115', storeCode: 'wcpos_command_conflict' }), PLATFORM_ERROR, NOTHING_PAID],
    ['insufficient_stock, recorded absent', left('insufficient_stock', { orderId: '115', storeCode: 'wcpos_insufficient_stock' }), INSUFFICIENT_STOCK, NOTHING_PAID],
    ['recorded 1 of 500 + 500', left('invalid_payload', { orderId: '115', recorded: 1 }, usd([500, 500])), PLATFORM_ERROR,
      'Order #115 was left part paid on the online store: $5.00 of $10.00.'],
    ['recorded 1 of 300 + 700', left('invalid_payload', { orderId: '115', recorded: 1 }, usd([300, 700])), PLATFORM_ERROR,
      'Order #115 was left part paid on the online store: $3.00 of $10.00.'],
    ['recorded 2 of 2', left('invalid_payload', { orderId: '115', recorded: 2 }, usd([500, 500])), PLATFORM_ERROR,
      'Order #115 was left part paid on the online store: $10.00 of $10.00.'],
    ['recorded 3 of 2', left('invalid_payload', { orderId: '115', recorded: 3 }, usd([500, 500])), PLATFORM_ERROR,
      'Order #115 was left part paid on the online store: $10.00 of $10.00.'],
    ['a free sale', left('invalid_payload', { orderId: '115' }, usd([])), PLATFORM_ERROR, NOTHING_PAID],
    ['displayId 1001', left('invalid_payload', { orderId: '115', displayId: '1001' }), PLATFORM_ERROR,
      'Order #1001 was left pending on the online store. Nothing was paid there.'],
    ['recorded 0', left('invalid_payload', { orderId: '115', recorded: 0 }, usd([500, 500])), PLATFORM_ERROR, NOTHING_PAID],
    ['recorded -1', left('invalid_payload', { orderId: '115', recorded: -1 }, usd([500, 500])), PLATFORM_ERROR, NOTHING_PAID],
    ['recorded 1.5', left('invalid_payload', { orderId: '115', recorded: 1.5 }, usd([500, 500])), PLATFORM_ERROR, NOTHING_PAID],
    ["recorded '1'", left('invalid_payload', { orderId: '115', recorded: '1' }, usd([500, 500])), PLATFORM_ERROR, NOTHING_PAID],
    ['recorded NaN', left('invalid_payload', { orderId: '115', recorded: Number.NaN }, usd([500, 500])), PLATFORM_ERROR, NOTHING_PAID],
  ])('names the store order after the refusal sentence: %s', (_name, sale, sentence, line) => {
    const { container } = render(<OrderSyncNotices order={sale} />);
    const shown = screen.getByTestId('order-left-on-store-x');
    expect(shown.textContent).toBe(line);
    expect(container.textContent).toBe(`${sentence}${line}`);
    expect(container.textContent).not.toContain('Platform says no');
    expect(container.textContent).not.toContain('invalid_payload');
  });

  it.each<[string, PosOrder, string]>([
    ["orderId ''", left('invalid_payload', { orderId: '' }), INVALID_PAYLOAD],
    ['orderId 115 (a number)', left('invalid_payload', { orderId: 115 }), INVALID_PAYLOAD],
    ['orderId absent', left('invalid_payload', { storeCode: 'total_mismatch' }), INVALID_PAYLOAD],
    ['data absent', left('invalid_payload', undefined), INVALID_PAYLOAD],
    ['error absent', order('x', { syncStatus: 'rejected' }), PLATFORM_ERROR],
    ['a reopened order (storeOrderId set)', left('insufficient_stock', { orderId: '115' }, { storeOrderId: '115' }), INSUFFICIENT_STOCK],
  ])('adds no line for %s, and keeps the sentence', (_name, sale, sentence) => {
    const { container } = render(<OrderSyncNotices order={sale} />);
    expect(screen.queryByTestId('order-left-on-store-x')).toBeNull();
    expect(container.textContent).toBe(sentence);
  });

  it.each(['pending', 'applied'] as const)('adds no line for a %s order with stale data', (syncStatus) => {
    render(<OrderSyncNotices order={left('invalid_payload', { orderId: '115', recorded: 1 }, { syncStatus })} />);
    expect(screen.queryByTestId('order-left-on-store-x')).toBeNull();
  });
});

describe('OrderSyncNotices notes', () => {
  it('shows since when a pending order is stuck, and nothing once it is applied', () => {
    const since = new Date(2026, 8, 29, 14, 2).getTime();
    const stuck = { commandIds: ['command-s'], reason: 'status_503', since, orders: [{ commandId: 'command-s', since, reason: 'status_503' }] };
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    render(<OrderSyncNotices order={order('s')} stuck={stuck} />);
    expect(screen.getByText(`Hasn't reached the online store since about ${time}.`)).toBeTruthy();
    cleanup();
    const { container } = render(<OrderSyncNotices order={order('s', { syncStatus: 'applied' })} stuck={stuck} />);
    expect(container.textContent).toBe('');
  });

  it('says a late sale is not in the register closure', () => {
    render(<OrderSyncNotices order={order('l', { lateSessionId: 'sess-1' })} />);
    expect(screen.getByText("Taken after the register closed. It is not in that register's closure.")).toBeTruthy();
  });

  it('says the customer was omitted', () => {
    render(<OrderSyncNotices order={order('c', { localWarnings: [{ code: 'customer_omitted', field: 'email' }] })} />);
    expect(screen.getByText("The customer's email couldn't be sent to the store, so the order isn't linked to them.")).toBeTruthy();
  });

  it('says the payment reference was dropped', () => {
    render(<OrderSyncNotices order={order('c', { localWarnings: [{ code: 'payment_reference_dropped', paymentId: 'p1' }] })} />);
    expect(screen.getByText("The terminal's payment reference couldn't be kept; the payment is recorded without it.")).toBeTruthy();
  });

  it('says the customer note was not sent', () => {
    render(<OrderSyncNotices order={order('n', noteNotSent)} />);
    expect(screen.getByTestId('order-note-not-sent-n').textContent).toBe(NOTE_NOT_SENT);
  });

  it('renders nothing for a clean applied order', () => {
    const { container } = render(<OrderSyncNotices order={order('a', { syncStatus: 'applied' })} />);
    expect(container.textContent).toBe('');
  });
});

describe('OrderSyncNotices extras not sent (ADR-092 condition 1)', () => {
  it('N1 says each extra was not sent at 11', () => {
    render(<OrderSyncNotices order={order('e', { ...extras, sentVersion: 11, syncStatus: 'applied' })} />);
    expect(screen.getByTestId('order-tax-ids-not-sent-e').textContent).toBe(TAX_IDS_NOT_SENT);
    expect(screen.getByTestId('order-meta-not-sent-e').textContent).toBe(META_NOT_SENT);
    expect(screen.getByTestId('order-sku-not-sent-e').textContent).toBe("The edited SKU of Blue shirt couldn't be sent to the store.");
  });

  it('N2 names two edited lines in the plural', () => {
    render(<OrderSyncNotices order={order('e', { lines: [edited('l1'), edited('l2', 'Red hat')], sentVersion: 11 })} />);
    expect(screen.getByTestId('order-sku-not-sent-e').textContent).toBe("The edited SKUs of Blue shirt, Red hat couldn't be sent to the store.");
  });

  it('N3 says none of them at 12', () => {
    const { container } = render(<OrderSyncNotices order={order('e', { ...extras, sentVersion: 12, syncStatus: 'applied' })} />);
    expect(container.textContent).toBe('');
  });

  it('N4 shows no SKU row for an unedited SKU', () => {
    render(<OrderSyncNotices order={order('e', { sentVersion: 11 })} />);
    expect(screen.queryByTestId('order-sku-not-sent-e')).toBeNull();
  });
});

describe('OrderSyncNotices store warnings', () => {
  it.each<[string, NonNullable<PosOrder['warnings']>, string]>([
    ['insufficient_stock', [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }], '1 sold without stock: Blue shirt'],
    ['tax_rate_mismatch', [{ code: 'tax_rate_mismatch', ratePpm: 55000, expectedMinor: 120, serverMinor: 100 }],
      `Tax at 5.5%: store ${eur(100)} vs POS ${eur(120)}`],
    ['customer_ignored', [{ code: 'customer_ignored', customerId: 'cus_1' }],
      "The online store didn't recognise the customer on this sale, so it was saved as a guest sale. Customer id: cus_1."],
    ['figures_mismatch', [{ code: 'figures_mismatch', fields: [{ field: 'taxMinor', tillMinor: 210, serverMinor: 200 }] }],
      `The online store worked out different figures for this sale. Tax: till ${eur(210)}, store ${eur(200)}.`],
    ['total_mismatch with a rounding line', [{ code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195, bridgeMinor: 5 }],
      `Store calculated ${eur(1195)}; a rounding line of +${eur(5)} brought it to ${eur(1200)}`],
    ['total_mismatch', [{ code: 'total_mismatch', serverMinor: 1000, expectedMinor: 1200 }], `Store total ${eur(1000)} vs POS ${eur(1200)}`],
  ])('renders %s', (_name, warnings, expected) => {
    render(<OrderSyncNotices order={order('w', { syncStatus: 'applied', warnings })} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('renders nothing for register_session_unknown', () => {
    const { container } = render(<OrderSyncNotices order={order('w', { syncStatus: 'applied',
      warnings: [{ code: 'register_session_unknown', sessionId: 's-1' }] })} />);
    expect(container.textContent).toBe('');
  });
});

describe('OrderSyncNotices children', () => {
  it('renders children after the note-not-sent notice and before the store warnings', () => {
    const warned = order('n', { ...noteNotSent, ...extras, warnings: [{ code: 'total_mismatch', serverMinor: 1000, expectedMinor: 1200 }] });
    render(<OrderSyncNotices order={warned}><Text testID="slot">Slot</Text></OrderSyncNotices>);
    const slot = screen.getByTestId('slot');
    const rows = ['note', 'tax-ids', 'meta', 'sku'].map((kind) => screen.getByTestId(`order-${kind}-not-sent-n`));
    for (const [before, after] of rows.slice(1).map((row, i) => [rows[i], row])) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByTestId('order-note-not-sent-n').compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[3].compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(screen.getByText(`Store total ${eur(1000)} vs POS ${eur(1200)}`)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
