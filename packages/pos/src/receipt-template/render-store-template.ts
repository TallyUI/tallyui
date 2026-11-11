import type { ReceiptTemplate, StoreOrder } from '@tallyui/core';
import type { SentOrder } from '../order/types';
import type { PosOrder } from '../pos-order/types';
import { buildReceiptData } from '../receipt/build-receipt-data';
import { buildReceiptDataFromPosOrder, buildReceiptDataFromStoreOrder } from '../receipt/reprint';
import type { ReceiptConfig } from '../receipt/types';
import { renderLogiclessTemplate, renderThermalPreview } from './render-template';
import type { RenderSanitizeOptions } from './render-template';
import { receiptTemplateData } from './template-data';
import { wcposReceiptData } from './wcpos/build';
import { wcposReceiptContext } from './wcpos/context';
import { formatWcposReceiptData } from './wcpos/format';
import { wcposSourceFromPosOrder, wcposSourceFromSentOrder, wcposSourceFromStoreOrder } from './wcpos/from-orders';
import type { WcposReceiptOptions, WcposReceiptStore } from './wcpos/types';

/** A sale a receipt prints from: the order as sent, the till's stored order, or an order read from the store. */
export type PrintableSale =
  | { kind: 'sent'; order: SentOrder }
  | { kind: 'pos'; order: PosOrder }
  | { kind: 'store'; order: StoreOrder };

export interface StoreTemplateContext {
  config: ReceiptConfig;
  pricesIncludeTax: boolean;
  /** Overrides merged over wcposReceiptContext's store/options (logo, locale, i18n the app knows). */
  store?: Partial<WcposReceiptStore>;
  options?: Partial<WcposReceiptOptions>;
  sanitize?: RenderSanitizeOptions;
}

function templateData(template: ReceiptTemplate, sale: PrintableSale, context: StoreTemplateContext): object {
  const { config } = context;
  if (template.dataModel === 'wcpos') {
    const source = sale.kind === 'sent' ? wcposSourceFromSentOrder(sale.order, config)
      : sale.kind === 'pos' ? wcposSourceFromPosOrder(sale.order, config) : wcposSourceFromStoreOrder(sale.order, config);
    const base = wcposReceiptContext(config, { pricesIncludeTax: context.pricesIncludeTax });
    const options = { ...base.options, ...context.options };
    return formatWcposReceiptData(wcposReceiptData(source, { ...base.store, ...context.store }, options));
  }
  const receipt = sale.kind === 'sent' ? buildReceiptData(sale.order, config)
    : sale.kind === 'pos' ? buildReceiptDataFromPosOrder(sale.order, config) : buildReceiptDataFromStoreOrder(sale.order, config);
  return receiptTemplateData(receipt);
}

/** Prints a store's fetched template from a sale. Throws for kind !== 'receipt'. */
export function renderStoreReceiptTemplate(template: ReceiptTemplate, sale: PrintableSale, context: StoreTemplateContext): string {
  if (template.kind !== 'receipt') throw new Error('Only receipt templates print from a sale');
  const data = templateData(template, sale, context);
  const render = template.engine === 'thermal' ? renderThermalPreview : renderLogiclessTemplate;
  return render(template.body, data, context.sanitize);
}
