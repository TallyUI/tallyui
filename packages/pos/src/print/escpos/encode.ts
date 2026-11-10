/**
 * `ReceiptData` to ESC/POS bytes. The strings come from `receiptTemplateData`, so a thermal receipt says what
 * the HTML receipt says, and the layout follows the 58/80 mm template (`receipt-template/default-templates.ts`)
 * and WCPOS v2's thermal template (monorepo main `packages/printer/src/encoder/default-thermal-template.ts`):
 * a name line, then `qty x price` with the amount right-aligned; feed 3, drawer, cut at the end. v2's rows
 * truncate a long cell; here the left part wraps and the amount sits on its last line. Left out: the QR code,
 * barcodes, logos and images (they need a raster path).
 */
import { formatMoney, moneyToMajor } from '@tallyui/core';
import type { ReceiptData } from '../../receipt/types';
import { receiptTemplateData, type ReceiptTemplateOptions } from '../../receipt-template/template-data';
import type { DrawerConnector } from '../../receipt-template/types';
import { foldText, resolveCodePage } from './code-page';
import { escpos } from './commands';

export interface EncodeEscPosOptions extends ReceiptTemplateOptions {
  /** Characters per line: 32 for 58 mm, 42 or 48 for 80 mm. */
  columns: number;
  /** `cp437` (the default, also for an unknown name) or `cp858`. */
  codePage?: string;
  /** Default true: a partial cut after the feed. */
  cut?: boolean;
  /** Default false: kick the drawer before the cut. */
  openDrawer?: boolean;
  /** Default `pin2`. */
  drawerConnector?: DrawerConnector;
}

/** Breaks at spaces; a word wider than `width` is split. Always at least one line. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (let word of text.split(' ').filter(Boolean)) {
    while (word.length > width) {
      if (line) lines.push(line);
      line = '';
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

export function encodeEscPos(receipt: ReceiptData, options: EncodeEscPosOptions): Uint8Array {
  const { columns, cut = true, openDrawer = false, drawerConnector = 'pin2' } = options;
  const page = resolveCodePage(options.codePage);
  const fold = (text: string) => foldText(text, page);
  // v2 format-money.ts: a currency symbol the page cannot print becomes the ISO code.
  const money = options.formatMoney ?? ((minor: number, currency: string) => {
    const formatted = formatMoney({ amount: minor, currency }) ?? '';
    if (!fold(formatted).includes('?')) return formatted;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code' })
      .format(moneyToMajor({ amount: minor, currency }));
  });
  const data = receiptTemplateData(receipt, { ...options, formatMoney: money });

  const out = escpos(page).init().codePage();
  const print = (lines: string[]) => { for (const line of lines) out.text(`${line}\n`); };
  const block = (text: string, indent = '') => fold(text).split('\n')
    .flatMap((part) => wrapText(part, columns - indent.length).map((line) => indent + line));
  const pair = (left: string, right: string, indent = '') => {
    const amount = fold(right);
    const space = columns - amount.length - 1;
    if (space <= indent.length) {
      print([...block(left, indent), amount.padStart(columns)]);
      return;
    }
    const lines = wrapText(fold(left), space - indent.length).map((line) => indent + line);
    const last = lines.pop() ?? '';
    print([...lines, last + ' '.repeat(columns - last.length - amount.length) + amount]);
  };
  const rule = (char: string) => print([char.repeat(columns)]);

  out.align('center').bold(true);
  print(block(data.store.name));
  out.bold(false);
  for (const { line } of data.store.addressLines) print(block(line));
  out.align('left');
  rule('-');
  out.align('center').bold(true);
  print(block(data.document.title));
  out.bold(false);
  if (data.document.isReprint) print(block(`Copy ${data.document.reprintCount}`));
  out.align('left');
  pair('Order', data.order.number);
  pair('Date', data.order.date);
  for (const [label, value] of [['Cashier', data.cashier], ['Register', data.register], ['Customer', data.customer]]) {
    if (value) pair(label, value);
  }
  rule('-');
  for (const line of data.lines) {
    print(block(line.name));
    for (const option of line.options) print(block(option.text, '  '));
    pair(line.detail, line.amount, '  ');
    for (const discount of line.discounts) pair(discount.label, discount.amount, '  ');
  }
  rule('-');
  pair('Subtotal', data.subtotal);
  if (data.lineDiscount) pair('Line discounts', data.lineDiscount);
  if (data.orderDiscount) pair('Order discount', data.orderDiscount);
  for (const charge of [...data.charges, ...data.taxes]) pair(charge.label, charge.amount);
  out.bold(true);
  pair('Total', data.total);
  out.bold(false);
  rule('=');
  for (const payment of data.payments) {
    pair(payment.reference ? `${payment.method} ${payment.reference}` : payment.method, payment.amount);
  }
  if (data.change) pair('Change', data.change);
  if (data.note) {
    out.feed(1);
    print(block(data.note));
  }
  out.feed(1).align('center');
  print(['Thank you']);
  out.align('left').feed(3);
  if (openDrawer) out.pulse(drawerConnector);
  if (cut) out.cut();
  return out.bytes();
}
