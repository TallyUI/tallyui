import type { ComponentType } from 'react';

/** The places on the POS screens an extension may contribute to (ADR-089 D3: closed; a new id comes only in a release of this package). */
export const TARGET_IDS = ['pos.cart.after-subtotal'] as const;
export type TargetId = (typeof TARGET_IDS)[number];

/** What an extension may ask for (ADR-089 D4). The app grants a subset per extension; ungranted ones are absent from the block's props. */
export const CAPABILITIES = ['sale.read', 'sale.coupons'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** A read-only, subscribable value (ADR-089 D4): an extension reads through it and never holds the sale object itself. */
export interface ReadView<T> {
  readonly value: T;
  subscribe(listener: () => void): () => void;
}

/** The sale as a block sees it: only what the two known consumers (medusapos CouponField, useGatedSale) read. */
export interface SaleView {
  readonly stage: 'cart' | 'tender' | 'receipt';
  /** The order's currency code, for formatting amounts. */
  readonly currency: string;
  /** The coupons on the sale, in display mode, in the order applied; empty when none. Amounts are integer minor units. */
  readonly coupons: ReadonlyArray<{ readonly code: string; readonly amountMinor: number }>;
  /** The store-priced coupons' prices are out of date (the sale changed since they were priced). */
  readonly couponPricesStale: boolean;
  /** The sale is pricing its coupons again; tender is refused meanwhile. */
  readonly couponsRepricing: boolean;
}

/** The coupon actions, granted by `sale.coupons`. Each resolves to the refusal to show, or null when done. */
export interface SaleActions {
  applyCoupon(code: string): Promise<string | null>;
  removeCoupon(code: string): string | null;
  repriceCoupons(): Promise<string | null>;
}

/** What the app hands a target for the sale: built once per sale screen by `useSaleSource`. */
export interface SaleSource {
  readonly view: ReadView<SaleView>;
  readonly actions: SaleActions;
}

/** What the host passes each target, by target id. */
export interface TargetSources {
  'pos.cart.after-subtotal': { sale: SaleSource };
}

/** What a block receives, by target id: `view` and `api` fields are present only when their capability was granted. */
export interface TargetBlockProps {
  'pos.cart.after-subtotal': {
    view: { sale?: ReadView<SaleView> };
    api: { sale?: SaleActions };
  };
}

/** One contribution to a target: its position and its lazily loaded block. */
export interface TargetContribution<T extends TargetId> {
  /** Lower renders first; default 100; ties break on extension id. Must be an integer. */
  order?: number;
  load: () => Promise<{ default: ComponentType<TargetBlockProps[T]> }>;
}

/**
 * An extension's manifest (ADR-089 D5). Everything but the `load` functions survives JSON.stringify,
 * so the same manifest can describe an extension that has not been loaded.
 */
export interface ExtensionManifest {
  /** Dotted and namespaced, lower case: `acme.loyalty`; first-party ids start `tallyui.`. */
  id: string;
  /** The contract it was written against: `EXTENSION_API_VERSION`. */
  apiVersion: number;
  capabilities: readonly Capability[];
  targets: { [T in TargetId]?: TargetContribution<T> };
}

export type RefusalReason =
  | 'id.invalid' | 'id.duplicate' | 'apiVersion.unsupported'
  | 'capability.unknown' | 'target.unknown' | 'target.invalid' | 'capability.notDeclared';

/** An extension the host did not load, and why (ADR-089 D6: never half-loaded). */
export interface ExtensionRefusal {
  readonly id: string;
  readonly reason: RefusalReason;
  /** The offending value, e.g. the unknown target id or the undeclared capability. */
  readonly detail: string;
}

export interface TargetEntry<T extends TargetId> {
  readonly extensionId: string;
  readonly order: number;
  /** The capabilities this extension was granted (always a subset of what it declared). */
  readonly capabilities: ReadonlySet<Capability>;
  readonly Block: ComponentType<TargetBlockProps[T]>;
}

export interface ExtensionHost {
  /** Accepted extension ids, in registration order. */
  readonly accepted: readonly string[];
  readonly refused: readonly ExtensionRefusal[];
  /** The target's entries, by `order` then extension id; the same array on every call. */
  entries<T extends TargetId>(target: T): readonly TargetEntry<T>[];
}

export interface CreateExtensionHostOptions {
  extensions: readonly ExtensionManifest[];
  /** Per extension id, the capabilities the app grants it. An extension with no entry is granted none. */
  grant?: Readonly<Record<string, readonly Capability[]>>;
  /** Where refusals and isolation failures are reported; default `console.warn`. */
  log?: (message: string) => void;
}

/** The props of `<ExtensionTarget>`: the target id and that target's sources. */
export type ExtensionTargetProps<T extends TargetId> = { id: T } & TargetSources[T];

/** The structural slice of `useSale()`'s result that `useSaleSource` reads; `@tallyui/pos`'s sale satisfies it without this package importing pos. */
export interface SaleLike {
  stage: { kind: 'cart' | 'tender' | 'receipt' };
  order: {
    currency: string;
    couponPricesStale?: true;
    display: { coupons?: ReadonlyArray<{ code: string; amountMinor: number }> };
  };
  couponsRepricing: boolean;
  applyCoupon(code: string): Promise<string | null>;
  removeCoupon(code: string): string | null;
  repriceCoupons(): Promise<string | null>;
}
