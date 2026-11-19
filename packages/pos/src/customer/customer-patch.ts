/** Customer form values to a create input or an update patch, with WCPOS v2's rules (MIT, WCPOS). Pure: writes nothing. */
import type { Customer, CustomerAddress, CustomerInput, CustomerPatch } from '@tallyui/core';

/** The customers screen's form values. `shipping` undefined is "Same as billing" (ShippingAddressFields' convention). */
export interface CustomerEditValues {
  firstName: string; lastName: string; email: string; phone: string; company?: string;
  billing?: CustomerAddress; shipping?: CustomerAddress;
}

type Part = keyof CustomerAddress;
// v2 SHIPPING_PARTS (address-rows.tsx:26). Must match PARTS in packages/components/src/customer/address-fields.tsx:13.
const SHIPPING_PARTS: readonly Part[] = ['firstName', 'lastName', 'company', 'phone', 'address1', 'address2', 'city', 'postcode', 'country', 'state'];
// v2 BILLING_PARTS (address-rows.tsx:28): a billing address also has email.
const BILLING_PARTS: readonly Part[] = [...SHIPPING_PARTS, 'email'];
const IDENTITY = ['firstName', 'lastName', 'email'] as const;
const TOP_LEVEL = ['firstName', 'lastName', 'email', 'phone', 'company'] as const;

const same = (parts: readonly Part[], a: CustomerAddress | undefined, b: CustomerAddress | undefined) =>
  parts.every((p) => (a?.[p] ?? '') === (b?.[p] ?? ''));
/** Shipping follows billing while no part is set, or every part equals billing's; email is never compared. */
export function shipsToBilling(shipping: CustomerAddress | undefined, billing: CustomerAddress | undefined): boolean {
  // v2 address-rows.tsx:39-41,46-47: !hasAny(shipping) || sameAddress(shipping, billing), absent reading as ''.
  return SHIPPING_PARTS.every((p) => !shipping?.[p]) || same(SHIPPING_PARTS, shipping, billing);
}

// v2 asShipping (address-rows.tsx:43-44): billing as the shipping address, without email.
function asShipping(billing: CustomerAddress | undefined): CustomerAddress {
  const shipping: CustomerAddress = { ...billing };
  delete shipping.email;
  return shipping;
}
/** The address without its empty and undefined parts; undefined when nothing is left. */
function clean(address: CustomerAddress | undefined): CustomerAddress | undefined {
  const kept = Object.entries(address ?? {}).filter(([, v]) => v !== undefined && v !== '');
  return kept.length ? (Object.fromEntries(kept) as CustomerAddress) : undefined;
}
const linked = (values: CustomerEditValues) => values.shipping === undefined || shipsToBilling(values.shipping, values.billing);

/** Form values to what `createCustomer` takes. */
export function toCustomerInput(values: CustomerEditValues): CustomerInput {
  const billing: CustomerAddress = { ...values.billing };
  // v2 customer-form.tsx:61-66: an empty billing name or email is filled from the customer's.
  for (const x of IDENTITY) if (!billing[x]) billing[x] = values[x];
  // v2 customer-form.tsx:67-68: a shipping that follows billing is stored as the filled billing's copy.
  const shipping = clean(linked(values) ? asShipping(billing) : values.shipping);
  const input: CustomerInput = { email: values.email };
  for (const x of ['firstName', 'lastName', 'phone', 'company'] as const) if (values[x]) input[x] = values[x];
  const cleanBilling = clean(billing);
  if (cleanBilling) input.billing = cleanBilling;
  if (shipping) input.shipping = shipping;
  return input;
}

/** Form values to what `updateCustomer` takes: only what changed; an address is sent whole. Does not validate. */
export function toCustomerPatch(before: Customer, values: CustomerEditValues): CustomerPatch {
  const patch: CustomerPatch = {};
  // A field is in the patch only when it changed, absent reading as ''; clearing one sends ''.
  for (const x of TOP_LEVEL) if ((values[x] ?? '') !== (before[x] ?? '')) patch[x] = values[x] ?? '';
  const billing: CustomerAddress = { ...values.billing };
  // v2 edit/form.tsx:50-52,69-72: a billing identity part follows a changed top-level part while empty or still equal to the old one.
  for (const x of IDENTITY) if (x in patch && (!billing[x] || billing[x] === before[x])) billing[x] = values[x];
  const cleanBilling = clean(billing);
  // An emptied billing is sent as {}: the contract's whole-replace clear (core customers.ts:41-44).
  if (!same(BILLING_PARTS, cleanBilling, clean(before.billing))) patch.billing = cleanBilling ?? {};
  if (linked(values)) {
    // v2 edit/form.tsx:56-63: while linked, a billing write carries shipping as billing's copy; so does linking it.
    if ('billing' in patch || !shipsToBilling(before.shipping, before.billing)) patch.shipping = clean(asShipping(billing)) ?? {};
  } else if (!same(SHIPPING_PARTS, clean(values.shipping), clean(before.shipping))) patch.shipping = clean(values.shipping) ?? {};
  return patch;
}
