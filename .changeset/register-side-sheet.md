---
'@tallyui/pos': minor
'@tallyui/components': minor
---

`RegisterPanel` takes `presentation="side"`, WCPOS v2's right-hand register sheet (#716): a header with the store, "open since", the session's age and the opener; the cash expected in large type "in the drawer"; Session sales with the sales count; the Paid in, Paid out and No sale tiles; the drawer ledger (Float, Cash sales, Cash refunds, Paid in, Paid out and No sale, each with its count, then Expected in the drawer); Other tenders; and a footer with Print X-report and Close register. Blind counting hides every figure. The new `storeName`, `onPrintXReport` and `now` props serve the side sheet; the default `presentation="dialog"` is unchanged. `DialogContent` takes `side="right"`. `deriveDrawerTerms` gives `deriveExpected`'s figures term by term with row counts and session sales, and `useRegisterSession` returns them as `terms`.
