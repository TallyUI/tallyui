---
"@tallyui/pos": minor
"@tallyui/components": minor
---

`Catalogue` gains an opt-in category nav (`showCategoryNav`, optional `categories`). "All products" comes first, then the categories of the listed products. The choice is kept in the view state as `categoryId` (new in `CatalogueViewState`, with the `setCategory` action). Visual change: `CategoryNav` chips are now rectangular (`rounded-md`) instead of pill-shaped (`rounded-full`), in every app that renders it.
`CategoryNav` chips are also exposed as radios (`role="radio"`, `aria-checked`) in a radiogroup labelled "Categories".
