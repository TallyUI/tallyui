# @tallyui/extensions (experimental)

The TallyUI extension API: an app registers extensions with a host it creates, and each extension contributes
to named places on the POS screens (targets). See ADR-089 in `docs/DECISIONS.md`.

**Experimental.** This package is at 0.x and is not published. Its contract may change in any commit until the
front desk calls 1.0; the "current and previous version" support promise begins at 1.0.

## Writing an extension

Use `defineExtension` (or a plain `ExtensionManifest`) with a dotted, namespaced, lower-case `id`,
`apiVersion: EXTENSION_API_VERSION`, declared `capabilities`, `targets` and `hooks`.
Blocks and hook handlers are lazy: each `load` resolves to `{ default: … }`.

```tsx
import { defineExtension, EXTENSION_API_VERSION, useReadView, type TargetBlockProps } from '@tallyui/extensions';

function Coupons({ view }: TargetBlockProps['pos.cart.after-subtotal']) {
  const sale = useReadView(view.sale!); // The app below grants sale.read.
  return <span>Coupons: {sale.coupons.length}</span>;
}

const manifest = defineExtension({
  id: 'acme.till',
  apiVersion: EXTENSION_API_VERSION,
  capabilities: ['sale.read', 'register.read'],
  targets: { 'pos.cart.after-subtotal': { load: async () => ({ default: Coupons }) } },
  hooks: { 'checkout.tender.start': {
    tier: 'guard',
    load: async () => ({ default: (ctx) => {
      if (ctx.view.register?.value.open === false) return { refuse: 'Register closed' };
    } }),
  } },
});
```

## Hosting extensions in an app

Create a host with `createExtensionHost({ extensions, grant })`. The app grants each extension a subset
of its declared capabilities; an extension with no `grant` entry gets nothing.
Keep the dispatch sources in a ref so `useSale`'s `tenderGate` reads the current sale and register views.
Pass the result of `useSaleSource(sale)` to `ExtensionTarget` in `Cart`'s `afterSubtotal` slot.

```tsx
import { useRef, useState } from 'react';
import type { RxDatabase } from 'rxdb';
import { Cart } from '@tallyui/components';
import { useSale } from '@tallyui/pos';
import {
  createExtensionHost, ExtensionHostProvider, ExtensionTarget, useSaleSource,
  type ActionSources, type ReadView, type RegisterView,
} from '@tallyui/extensions';

function Harness({ db, register }: { db: RxDatabase; register: ReadView<RegisterView> }) {
  const [host] = useState(() => createExtensionHost({
    extensions: [manifest], grant: { 'acme.till': ['sale.read', 'register.read'] },
  }));
  const sources = useRef<ActionSources>({});
  const sale = useSale({ currency: 'GBP' }, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.pos_drafts,
    tenderGate: attempt => host.dispatch('checkout.tender.start', attempt, sources.current),
  });
  const saleSource = useSaleSource(sale);
  sources.current = { sale: saleSource, register };
  return <ExtensionHostProvider host={host}>
    <Cart sale={sale} afterSubtotal={<ExtensionTarget id="pos.cart.after-subtotal" sale={saleSource} />} />
  </ExtensionHostProvider>;
}
```

Mount this under the app's `TaxProvider` from `@tallyui/pos`, with its draft collection and register view.
See [extensions-till.test.tsx](../integration-tests/src/extensions-till.test.tsx) for the runnable
example, including database and tax setup and open/closed register checks; the example above adds the `Cart` slot.

## Targets, capabilities and actions

`TARGET_IDS`:

- `pos.cart.after-subtotal` — a block after the cart subtotal.

`CAPABILITIES`:

- `sale.read` — the read-only sale view in blocks and hooks.
- `sale.coupons` — `applyCoupon`, `removeCoupon` and `repriceCoupons` through a block's `api.sale`.
- `register.read` — the read-only register view (`open`) in hooks.

`ACTION_EVENTS`:

- `checkout.tender.start` — a tender attempt with a `{ method }` payload.

## How a dispatch runs

[ADR-089 D11](../../docs/DECISIONS.md#adr-089-extension-api-v1-experimental) defines the action pipeline:

- `host.dispatch(event, payload, sources)` resolves to a refusal message or `null` to continue; it never rejects.
- Guards run first. A guard refusal or `GUARD_FAILED` ends the dispatch before the extension tier runs.
- The extension tier fails open: failures skip the hook, and a returned `{ refuse }` is ignored and logged.
- Each tier shares one `ACTION_BUDGET_MS` budget per dispatch (1,500 ms for `checkout.tender.start`),
  including hook loading.
- A hook starved by an already-spent tier budget takes no strike; it is skipped, or a guard returns `GUARD_FAILED`.
- A throw, rejected load, timeout or malformed verdict takes a strike. At `ACTION_HOOK_STRIKES` (3),
  the hook is switched off for the host's life; switched-off guards still refuse with `GUARD_FAILED`.
- Resolved hook modules are cached; failed loads are retried on the next dispatch unless the hook is switched off.
- Hook views contain sale and register sources only when supplied by the app and granted to the extension.

## Refusals

`host.refused` lists rejected manifests as `ExtensionRefusal` records with `id`, `reason` and `detail`.
The host accepts or refuses a whole manifest. `RefusalReason` values are:

- `id.invalid`
- `id.duplicate`
- `apiVersion.unsupported`
- `capability.unknown`
- `target.unknown`
- `target.invalid`
- `capability.notDeclared`
- `hook.unknown`
- `hook.invalid`
