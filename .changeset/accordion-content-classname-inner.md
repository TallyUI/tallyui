---
'@tallyui/components': minor
---

`AccordionContent`'s `className` now goes to the inner padded view (default `pb-4 pt-0`) instead of the outer collapsible container, as in WCPOS v2. This changes what the prop means: a class that used to style the outer container (a border or `overflow-*`, say) now styles the padded view inside the fold, and a padding class now replaces `pb-4 pt-0`. No in-repo caller passed `className`.
