import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { I18nProvider, type Catalogues } from '../i18n';
import { Tender } from '../sale/tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
/** A test catalogue: no `pos_checkout.no_payments_yet`, so that key falls back to English. */
const fr: Catalogues = { fr: { 'common.total': 'Total à payer', 'pos_checkout.take_amount_in': 'Encaisser {amount} en {method}' } };

const pane = () => <SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>;
function start(wrap: (children: ReactNode) => ReactNode = (children) => children) {
  const view = render(wrap(pane()));
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 5000));
  act(() => sale.startTender('cash'));
  return view;
}

describe('I18nProvider and useT', () => {
  it('shows the bundled English with no provider', () => {
    start();
    expect(text('tender-headline')).toBe(`Total${money(5000)}`);
    expect(text('tender-ledger')).toBe('No payments yet');
  });

  it('shows a string from the catalogue the app passes for its locale', () => {
    start((children) => <I18nProvider locale="fr" resources={fr}>{children}</I18nProvider>);
    expect(text('tender-headline')).toBe(`Total à payer${money(5000)}`);
  });

  it('falls back from a regional locale to its base language', () => {
    start((children) => <I18nProvider locale="fr_CA" resources={fr}>{children}</I18nProvider>);
    expect(text('tender-headline')).toBe(`Total à payer${money(5000)}`);
  });

  it('shows English for a key the language does not have', () => {
    start((children) => <I18nProvider locale="fr" resources={fr}>{children}</I18nProvider>);
    expect(text('tender-ledger')).toBe('No payments yet');
  });

  it('interpolates {name} values into the label', () => {
    start((children) => <I18nProvider locale="fr" resources={fr}>{children}</I18nProvider>);
    expect(text('tender-take')).toBe(`Encaisser ${money(5000)} en Cash`);
  });

  it("uses the device's locale when the app passes none", () => {
    const resolved = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...resolved.call(this), locale: 'fr-FR' };
    });
    start((children) => <I18nProvider resources={fr}>{children}</I18nProvider>);
    expect(text('tender-headline')).toBe(`Total à payer${money(5000)}`);
  });

  it("lets the app's en override a bundled English key at mount, keeping the others", () => {
    start((children) => <I18nProvider locale="en" resources={{ en: { 'tender.complete_sale': 'Finish' } }}>{children}</I18nProvider>);
    expect(text('tender-complete')).toBe('Finish');
    expect(text('tender-headline')).toBe(`Total${money(5000)}`);
    expect(text('tender-ledger')).toBe('No payments yet');
  });

  it('takes catalogues that arrive after mount, and a locale change', () => {
    const view = start((children) => <I18nProvider locale="fr">{children}</I18nProvider>);
    expect(text('tender-headline')).toBe(`Total${money(5000)}`);
    act(() => view.rerender(<I18nProvider locale="fr" resources={fr}>{pane()}</I18nProvider>));
    expect(text('tender-headline')).toBe(`Total à payer${money(5000)}`);
    act(() => view.rerender(<I18nProvider locale="en" resources={fr}>{pane()}</I18nProvider>));
    expect(text('tender-headline')).toBe(`Total${money(5000)}`);
  });
});
