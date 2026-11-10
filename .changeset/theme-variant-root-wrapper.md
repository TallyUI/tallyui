---
"@tallyui/theme": patch
---

`tokens.css` no longer wraps its `@variant light` and `@variant dark` blocks in `:root`, so the dark theme applies on web with Uniwind 1.4, which turned the wrapped rule into `:root .dark` and never matched. Token values are unchanged, and both themes still apply on web and native with Uniwind 1.3.
