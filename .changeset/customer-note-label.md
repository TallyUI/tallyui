---
'@tallyui/components': patch
---

`CartNoteInput` now calls the sale note "Customer note", since WooCommerce sends it as `customer_note` and it prints on the customer's emails and receipts. The default link reads "Add customer note" (was "Add note") and the default placeholder is "Customer note" (was "Order note..."). A new `label` prop names the note for the link, the placeholder and the input's accessibility label. Apps passing their own `placeholder` keep it. Orders now labels the note "Customer note: …" (was "Note: …"), and the line under a note the store could not take reads "The customer note couldn't be sent to the store." on the receipt and in Orders.
