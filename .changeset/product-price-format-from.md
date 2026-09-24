---
"@tallyui/components": minor
---

`ProductPrice` gains a `formatFrom` prop, `(price: string) => string`, for languages whose word order puts the "from" label after the price (`formatFrom={(p) => \`${p} ab\`}` renders `€10.00 ab`); `fromLabel` stays as a deprecated alias. Visible change: every price — the regular price, the "from" range and the sale price — now uses the theme's `text-price` (or `text-sale`) token instead of `text-foreground`. Apps with screenshot tests covering `ProductPrice` will need to re-shoot them.
