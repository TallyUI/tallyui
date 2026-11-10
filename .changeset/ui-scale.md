---
'@tallyui/theme': minor
'@tallyui/components': minor
---

Add the UI scale: nine size tokens for each of the compact, regular and spacious steps with Auto picking by window size, pointer floors for controls and rows, an opt-in `@tallyui/theme/scale.css`, and a `ScaleProvider` that applies the stored `ui.scale` setting on native and mirrors it onto the web document root so portals scale too. `Text` now caps the OS text multiplier at `MAX_FONT_SCALE` (1.3) unless a caller overrides it.
