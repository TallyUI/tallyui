export type ReceiptPaper = '58mm' | '80mm';
/** Characters per line (v2 encode-receipt.ts:18). */
export const PAPER_COLUMNS: Record<ReceiptPaper, number> = { '58mm': 32, '80mm': 48 };
export const DEFAULT_RECEIPT_TEMPLATES: Record<ReceiptPaper, string> = {
  '58mm': receiptTemplate(32, 10, 12),
  '80mm': receiptTemplate(48, 12, 14),
};

function receiptTemplate(columns: number, labelWidth: number, amountWidth: number): string {
  return `<receipt paper-width="${columns}">
  <align mode="center">
    <bold><text>{{store.name}}</text></bold>
    {{#store.addressLines}}
    <text>{{line}}</text>
    {{/store.addressLines}}
  </align>
  <line />
  <align mode="center"><bold><text>{{document.title}}</text></bold></align>
  {{#document.isReprint}}
  <align mode="center"><text>Copy {{document.reprintCount}}</text></align>
  {{/document.isReprint}}
  <row><col width="${labelWidth}">Order</col><col width="*" align="right">{{order.number}}</col></row>
  <row><col width="${labelWidth}">Date</col><col width="*" align="right">{{order.date}}</col></row>
  {{#cashier}}
  <row><col width="${labelWidth}">Cashier</col><col width="*" align="right">{{cashier}}</col></row>
  {{/cashier}}
  {{#register}}
  <row><col width="${labelWidth}">Register</col><col width="*" align="right">{{register}}</col></row>
  {{/register}}
  {{#customer}}
  <row><col width="${labelWidth}">Customer</col><col width="*" align="right">{{customer}}</col></row>
  {{/customer}}
  <line style="dashed" />
  {{#lines}}
  <text>{{name}}</text>
  {{#options}}
  <text>  {{text}}</text>
  {{/options}}
  <row><col width="*">  {{detail}}</col><col width="${amountWidth}" align="right">{{amount}}</col></row>
  {{#discounts}}
  <row><col width="*">  {{label}}</col><col width="${amountWidth}" align="right">{{amount}}</col></row>
  {{/discounts}}
  {{/lines}}
  <line style="dashed" />
  <row><col width="*">Subtotal</col><col width="${amountWidth}" align="right">{{subtotal}}</col></row>
  {{#lineDiscount}}
  <row><col width="*">Line discounts</col><col width="${amountWidth}" align="right">{{lineDiscount}}</col></row>
  {{/lineDiscount}}
  {{#orderDiscount}}
  <row><col width="*">Order discount</col><col width="${amountWidth}" align="right">{{orderDiscount}}</col></row>
  {{/orderDiscount}}
  {{#charges}}
  <row><col width="*">{{label}}</col><col width="${amountWidth}" align="right">{{amount}}</col></row>
  {{/charges}}
  {{#taxes}}
  <row><col width="*">{{label}}</col><col width="${amountWidth}" align="right">{{amount}}</col></row>
  {{/taxes}}
  <bold><row><col width="*">Total</col><col width="${amountWidth}" align="right">{{total}}</col></row></bold>
  <line />
  {{#payments}}
  <row><col width="*">{{method}}{{#reference}} {{reference}}{{/reference}}</col><col width="${amountWidth}" align="right">{{amount}}</col></row>
  {{/payments}}
  {{#change}}
  <row><col width="*">Change</col><col width="${amountWidth}" align="right">{{change}}</col></row>
  {{/change}}
  {{#note}}
  <feed lines="1" />
  <text>{{note}}</text>
  {{/note}}
  <feed lines="1" />
  <align mode="center"><text>Thank you</text></align>
  {{#qrPayload}}
  <align mode="center"><qrcode size="4">{{qrPayload}}</qrcode></align>
  {{/qrPayload}}
  <feed lines="3" />
  <cut />
</receipt>`;
}
