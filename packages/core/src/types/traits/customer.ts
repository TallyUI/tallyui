/**
 * Customer traits — the stable interface that UI components program against.
 *
 * Each connector implements these to extract standard customer data
 * from its own schema shape.
 */
export interface CustomerTraits<Doc = any> {
  /** Customer display name (first + last or company) */
  getName: (doc: Doc) => string;

  /** Email address */
  getEmail: (doc: Doc) => string | undefined;

  /** Phone number */
  getPhone: (doc: Doc) => string | undefined;

  /** One-line address summary (e.g., "123 Main St, Springfield") */
  getAddressSummary: (doc: Doc) => string | undefined;

  /** The connector-specific unique ID (as string for consistency) */
  getId: (doc: Doc) => string;
}
