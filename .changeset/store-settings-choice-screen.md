---
"@tallyui/components": minor
---

`StoreSettingsChoiceScreen`: the picker the app shows when `storeSettings` rejects with `choice_required` (TV4), for a store with several regions, countries or sales channels — medusa-dev's one region with 7 countries always hits this. Renders a radio-row section per choice offered, pre-selects a single-option section or a matching `initial` value, and calls `onSubmit` with the picked fields once every shown section has a selection.
