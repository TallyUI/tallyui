import type { ReceiptData } from '../receipt/types';
import { DEFAULT_RECEIPT_TEMPLATES } from './default-templates';
import type { ReceiptPaper } from './default-templates';
import { renderThermalPreview } from './render-template';
import { receiptTemplateData } from './template-data';
import type { ReceiptTemplateOptions } from './template-data';

export interface RenderReceiptOptions extends ReceiptTemplateOptions {
  /** Default '80mm'. Picks DEFAULT_RECEIPT_TEMPLATES[paper] when no template is given. */
  paper?: ReceiptPaper;
  /** A thermal-XML Mustache template over ReceiptTemplateData. */
  template?: string;
}

/** receiptTemplateData, then renderThermalPreview (sanitized). Needs a global DOMParser (browsers, jsdom). */
export function renderReceiptHtml(receipt: ReceiptData, options: RenderReceiptOptions = {}): string {
  const template = options.template ?? DEFAULT_RECEIPT_TEMPLATES[options.paper ?? '80mm'];
  return renderThermalPreview(template, receiptTemplateData(receipt, options));
}
