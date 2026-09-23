---
'@tallyui/theme': patch
---

`tokens.css` now defines the light theme in a `@variant light` block, alongside `@variant dark`. Uniwind requires every theme to set the same variables, so apps using Uniwind no longer print 27 "Theme light is missing variable" errors per bundle. The file also declares the `light` custom variant, so it still compiles with plain Tailwind 4. Colour values are unchanged.
