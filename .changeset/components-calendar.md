---
"@tallyui/components": minor
---

Add `Calendar` (single and range modes, `min`/`max`, a week start; a plain month grid with no new dependency) and the pure month helpers it uses, and `DateRangeMenu`, the Reports period menu with the date presets beside the calendar (WCPOS v2's date button). The Sales room's period control is now that menu, so a custom range can be picked; `SalesFiltersBar` takes an optional `earliestDay`. `SalesFilters.preset` widens from `DatePreset` to `DatePreset | 'custom'`, so code that reads it must handle `'custom'`. The separate `sales-filter-dates` text is gone: the menu's trigger shows the dates.
