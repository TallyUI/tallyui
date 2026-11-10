import type { CustomerTraits } from './traits/customer';

/** A customer's postal address. Platform-neutral; every field optional. `country` is an ISO 3166-1 alpha-2 code. */
export interface CustomerAddress {
  firstName?: string; lastName?: string; company?: string;
  address1?: string; address2?: string; city?: string; state?: string; postcode?: string; country?: string;
  phone?: string; email?: string;
}

/**
 * A tax registration number (VAT, ABN, GST, EIN…). `type` is the connector's own id for the scheme; WCPOS v2's set is
 * eu_vat, gb_vat, au_abn, br_cpf, br_cnpj, in_gst, it_cf, it_piva, es_nif, ar_cuit, sa_vat, ca_gst_hst, us_ein, other.
 */
export interface CustomerTaxId { type: string; value: string; country?: string; label?: string }

/** A store customer, as the till shows and picks it (programme item 14). Platform-neutral. */
export interface Customer {
  /** The platform's id: order.create v3 sends it as `customer.customerId`. */
  id: string;
  /** Display name: first + last, else company, else email, else id. Never empty. */
  name: string;
  firstName?: string; lastName?: string; email?: string; phone?: string; company?: string;
  billing?: CustomerAddress; shipping?: CustomerAddress; taxIds?: CustomerTaxId[];
}

/** What the till collects to create a customer. v1 requires an email; addresses and tax ids are optional. */
export interface CustomerInput {
  email: string; firstName?: string; lastName?: string; phone?: string; company?: string;
  billing?: CustomerAddress; shipping?: CustomerAddress; taxIds?: CustomerTaxId[];
}

/**
 * A change to an existing customer: any subset of {@link CustomerInput}. A field left out is unchanged; `billing`,
 * `shipping` and `taxIds`, when given, replace the stored value whole (`taxIds: []` removes every tax id).
 */
export type CustomerPatch = Partial<CustomerInput>;

export const customerTraits: CustomerTraits<Customer> = {
  getId: (customer) => customer.id,
  getName: (customer) => customer.name,
  getEmail: (customer) => customer.email,
  getPhone: (customer) => customer.phone,
  getAddressSummary: () => undefined,
};

/** A customer call that failed for a reason other than credentials (credentials throw ConnectorUnauthorizedError). */
export class CustomerServiceError extends Error {
  /** The HTTP status the store answered with, when the connector has it; undefined for a network failure (no response). */
  readonly status?: number;
  constructor(readonly code: 'network' | 'server' | 'invalid', message: string, options?: { status?: number }) {
    super(message);
    this.name = 'CustomerServiceError';
    this.status = options?.status;
  }
}
