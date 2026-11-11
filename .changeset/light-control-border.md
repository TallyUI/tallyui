---
'@tallyui/theme': patch
'@tallyui/components': patch
---

Lighter control borders and a card fill, matching WCPOS v2 (#756). In the light theme `--color-input` is now `#d1d5db` (was `#848a94`), so inputs, selects, toggles and outline buttons get a light grey border that still stands out more than `--color-border`; the dark theme's value is unchanged. The outline variant of `Button` and `IconButton`, and `SelectTrigger`, now fill with `bg-card` instead of `bg-background`, so they read as white controls on a white card in the light theme and as card-coloured controls in the dark theme. `Input`, `Textarea` and the `Combobox` trigger fill with `bg-card` too, so every bordered control matches.
