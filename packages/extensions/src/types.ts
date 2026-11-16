import type { ComponentType } from 'react';

/** The places on the POS screens an extension may contribute to (ADR-089 D3: closed; a new id comes only in a release of this package). */
export const TARGET_IDS = ['pos.cart.after-subtotal'] as const;
export type TargetId = (typeof TARGET_IDS)[number];

/** What an extension may ask for (ADR-089 D4). The app grants a subset per extension; ungranted ones are absent from the block's props. */
export const CAPABILITIES = ['sale.read', 'sale.coupons', 'register.read'] as const;
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

/** The events an extension may hook (ADR-089 D11): closed, like the target ids. */
export const ACTION_EVENTS = ['checkout.tender.start'] as const;
export type ActionEvent = (typeof ACTION_EVENTS)[number];

/** Per event, the time one tier's hooks share on a dispatch, in ms (WCPOS v2 ACTION_BUDGET_MS). */
export const ACTION_BUDGET_MS: Readonly<Record<ActionEvent, number>> = { 'checkout.tender.start': 1500 };
/** Failures (a throw, a rejected load, a timeout, a malformed verdict) after which a hook is switched off for the host's life. */
export const ACTION_HOOK_STRIKES = 3;
/** What a dispatch refuses with when a guard throws, times out or has been switched off: a guard fails closed. */
export const GUARD_FAILED = 'A checkout check could not run, so this was stopped';

/** The register as a hook sees it, granted by `register.read`. */
export interface RegisterView {
  readonly open: boolean;
}

/** Per event, the action's payload, frozen. */
export interface ActionPayloads {
  'checkout.tender.start': { readonly method: 'cash' | 'external' };
}

/** What the app supplies a dispatch; a hook sees each only when its extension was granted the read capability. */
export interface ActionSources {
  sale?: SaleSource;
  register?: ReadView<RegisterView>;
}

export interface ActionContext<E extends ActionEvent> {
  readonly event: E;
  readonly payload: ActionPayloads[E];
  readonly view: { readonly sale?: ReadView<SaleView>; readonly register?: ReadView<RegisterView> };
}

/** Return nothing to go on, or refuse with the message the app shows. Only a `guard` hook's refusal stops the action. */
export type ActionVerdict = void | { refuse: string };
export type ActionHandler<E extends ActionEvent> = (ctx: ActionContext<E>) => ActionVerdict | Promise<ActionVerdict>;

/** One hook on an event: its tier and its lazily loaded handler. */
export interface HookContribution<E extends ActionEvent> {
  /** `guard` fails closed (a failing or switched-off guard refuses); `extension` fails open and cannot refuse. */
  tier: 'guard' | 'extension';
  load: () => Promise<{ default: ActionHandler<E> }>;
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
  hooks?: { [E in ActionEvent]?: HookContribution<E> };
}

export type RefusalReason =
  | 'id.invalid' | 'id.duplicate' | 'apiVersion.unsupported'
  | 'capability.unknown' | 'target.unknown' | 'target.invalid' | 'capability.notDeclared'
  | 'hook.unknown' | 'hook.invalid';

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
  /** Runs the event's hooks (ADR-089 D11); resolves to the refusal to show, or null to go on. Never rejects. */
  dispatch<E extends ActionEvent>(event: E, payload: ActionPayloads[E], sources?: ActionSources): Promise<string | null>;
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
