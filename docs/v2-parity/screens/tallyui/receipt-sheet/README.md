# ReceiptSheet (queue row R4)

The demo screen `apps/demo/app/pos/receipt-sheet.tsx` in Chromium at 1280x800, reduced motion, JPEG quality 70.
v2 reference: `docs/v2-parity/screens/v2/receipt.jpg`.

- `sheet-light-1280x800.jpg`, `sheet-dark-1280x800.jpg`: `?open=1`, three templates; the Template picker, the
  Printer row, the `ReceiptPreview` child, and Close, Email Receipt, Print receipt on the right of the footer.
- `template-select-light-1280x800.jpg`, `template-select-dark-1280x800.jpg`: the same with the template Select open;
  "Kitchen ticket" is the disabled item (`aria-disabled="true"` in the browser).
- `one-template-light-1280x800.jpg`, `one-template-dark-1280x800.jpg`: `?open=1&one=1`; the Template row shows the one
  template's title as text.

Left out against v2 (later rows): the printer switcher, Download PDF, the preview's zoom, the close icon in the header.
The demo page's own header does not follow the dark scheme; the sheet does.
