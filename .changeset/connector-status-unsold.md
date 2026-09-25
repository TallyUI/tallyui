---
"@tallyui/components": minor
---

`ConnectorStatus` gains `unsoldCount`, `unsoldStale` and `formatUnsold` props, showing how many products the sales channel doesn't sell (the calculated-price runner's `unreported`) below `lastSync`, using the `warning` token when current and `muted-foreground` when stale.
