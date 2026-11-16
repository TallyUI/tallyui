import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createExtensionHost, ExtensionHostProvider, ExtensionTarget, useExtensionHost } from './index';
import type { ExtensionManifest, SaleSource, TargetBlockProps, TargetContribution } from './index';

const target = 'pos.cart.after-subtotal';
function source(): SaleSource {
  return { view: {
    value: { stage: 'cart', currency: 'EUR', coupons: [], couponPricesStale: false, couponsRepricing: false },
    subscribe: () => () => {},
  }, actions: { applyCoupon: vi.fn(async () => null), removeCoupon: vi.fn(() => null), repriceCoupons: vi.fn(async () => null) } };
}
function extension(id: string, contribution: TargetContribution<typeof target>): ExtensionManifest {
  return { id, apiVersion: 1, capabilities: ['sale.read', 'sale.coupons'], targets: { [target]: contribution } };
}
afterEach(() => { vi.restoreAllMocks(); });

it('renders nothing without a provider and returns a null host', () => {
  const readHost = vi.fn();
  function Outside() { readHost(useExtensionHost()); return <ExtensionTarget id={target} sale={source()} />; }
  const { container } = render(<Outside />);
  expect(container.innerHTML).toBe('');
  expect(readHost).toHaveBeenCalledWith(null);
});

it('renders nothing for an empty host', () => {
  const host = createExtensionHost({ extensions: [] });
  const { container } = render(<ExtensionHostProvider host={host}><ExtensionTarget id={target} sale={source()} /></ExtensionHostProvider>);
  expect(container.innerHTML).toBe('');
});

it('renders blocks as siblings in entry order and loads each once', async () => {
  const load = vi.fn(async () => ({ default: () => <span>second</span> }));
  const host = createExtensionHost({ extensions: [extension('b.x', { order: 50, load }),
    extension('a.x', { order: 50, load: async () => ({ default: () => <span>first</span> }) })] });
  expect(load).not.toHaveBeenCalled();
  const sale = source();
  const tree = <ExtensionHostProvider host={host}><ExtensionTarget id={target} sale={sale} /></ExtensionHostProvider>;
  const { container, rerender } = render(tree);
  await waitFor(() => { expect(container.textContent).toBe('firstsecond'); });
  expect(Array.from(container.children).map(child => child.tagName)).toEqual(['SPAN', 'SPAN']);
  rerender(tree);
  expect(load).toHaveBeenCalledTimes(1);
});

it('grants read access only and keeps mapped props stable while the source is stable', async () => {
  const sale = source(), received = vi.fn();
  function Block(props: TargetBlockProps[typeof target]) { received(props); return <span>read</span>; }
  const host = createExtensionHost({ extensions: [extension('read.only', { load: async () => ({ default: Block }) })],
    grant: { 'read.only': ['sale.read'] } });
  const { rerender } = render(<ExtensionHostProvider host={host}><ExtensionTarget id={target} sale={sale} /></ExtensionHostProvider>);
  await screen.findByText('read');
  const initial = received.mock.lastCall![0] as TargetBlockProps[typeof target];
  expect(initial.view.sale).toBe(sale.view);
  expect(initial.api).not.toHaveProperty('sale');
  rerender(<ExtensionHostProvider host={host}><ExtensionTarget id={target} sale={sale} /></ExtensionHostProvider>);
  expect(received.mock.lastCall![0].view).toBe(initial.view);
  expect(received.mock.lastCall![0].api).toBe(initial.api);
});

it('grants coupon actions that call the provided source', async () => {
  const sale = source();
  function Block({ api }: TargetBlockProps[typeof target]) {
    return <button onClick={() => { void api.sale!.applyCoupon('x'); }}>apply</button>;
  }
  const host = createExtensionHost({ extensions: [extension('read.write', { load: async () => ({ default: Block }) })],
    grant: { 'read.write': ['sale.read', 'sale.coupons'] } });
  render(<ExtensionHostProvider host={host}><ExtensionTarget id={target} sale={sale} /></ExtensionHostProvider>);
  fireEvent.click(await screen.findByText('apply'));
  expect(sale.actions.applyCoupon).toHaveBeenCalledExactlyOnceWith('x');
});

it.each(['render', 'load'] as const)('isolates a failing %s without affecting siblings', async failure => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const log = vi.fn(), error = new Error('broken');
  function Broken(): never { throw error; }
  const load = failure === 'load' ? async () => { throw error; } : async () => ({ default: Broken });
  const host = createExtensionHost({ extensions: [extension('bad.block', { load }),
    extension('good.block', { load: async () => ({ default: () => <span>survived</span> }) })], log });
  const sale = source();
  const { container, rerender } = render(<ExtensionHostProvider host={host}><ExtensionTarget id={target} sale={sale} /></ExtensionHostProvider>);
  await screen.findByText('survived');
  await waitFor(() => { expect(log).toHaveBeenCalledExactlyOnceWith(`[@tallyui/extensions] bad.block failed in ${target}: Error: broken`); });
  expect(container.textContent).toBe('survived');
  rerender(<ExtensionHostProvider host={host}><ExtensionTarget id={target} sale={sale} /></ExtensionHostProvider>);
  expect(log).toHaveBeenCalledTimes(1);
});
