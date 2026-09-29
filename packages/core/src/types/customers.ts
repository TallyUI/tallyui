/** A store customer, as the till shows and picks it (programme item 14). Platform-neutral. */
export interface Customer {
  /** The platform's id: order.create v3 sends it as `customer.customerId`. */
  id: string;
  /** Display name: first + last, else company, else email, else id. Never empty. */
  name: string;
  firstName?: string; lastName?: string; email?: string; phone?: string; company?: string;
}

/** What the till collects to create a customer. v1 requires an email. */
export interface CustomerInput { email: string; firstName?: string; lastName?: string; phone?: string; company?: string }

/** A customer call that failed for a reason other than credentials (credentials throw ConnectorUnauthorizedError). */
export class CustomerServiceError extends Error {
  constructor(readonly code: 'network' | 'server' | 'invalid', message: string) { super(message); this.name = 'CustomerServiceError'; }
}
