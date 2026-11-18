---
'@tallyui/components': minor
---

`ReceiptSheet` takes an optional `email` prop (`ReceiptSheetEmail`) that draws WCPOS v2's receipt email form inside the sheet: "Email Receipt" opens an "Email Address" field prefilled from `defaultAddress`, an optional "Save email to the customer" switch, v2's offline notice with "Send when online", and an inline error. Send checks the address and calls `onSend`, which sends or queues in the app and returns a refusal to show or `null` to close the form. With `email` given, `onEmail` is not called; without it the sheet is unchanged.
