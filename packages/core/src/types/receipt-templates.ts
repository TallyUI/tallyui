/** What a template prints: a sale's receipt, a report, or a register closure. */
export type ReceiptTemplateKind = 'receipt' | 'report' | 'closure';

/**
 * A store's print template, as the till's renderer takes it (`@tallyui/pos` receipt-template).
 * `html` bodies are Mustache HTML (renderLogiclessTemplate); `thermal` bodies are Mustache over `<receipt>` XML
 * (renderThermalPreview).
 */
export interface ReceiptTemplate {
  /** The platform's id, as a string (`"64965"`, `"plugin-core"`). */
  id: string;
  kind: ReceiptTemplateKind;
  title: string;
  engine: 'html' | 'thermal';
  /** The Mustache source. Never empty. */
  body: string;
  /** The paper a thermal body is laid out for; absent for html. */
  paper?: '58mm' | '80mm';
  /**
   * The data vocabulary the body's Mustache tags expect.
   * - `'wcpos'`: WCPOS's receipt data (store.address_lines, totals.total_incl_display, …).
   * - `'tallyui'`: @tallyui/pos `receiptTemplateData`.
   * A body renders blank fields over data in the other vocabulary.
   */
  dataModel: 'wcpos' | 'tallyui';
}
