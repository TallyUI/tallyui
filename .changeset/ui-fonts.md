---
'@tallyui/theme': minor
'@tallyui/components': minor
---

Add font choices for the `ui.font` setting: the font-family tokens, face list and type sets (system, instrument, grotesk, fraunces, manrope) in `@tallyui/theme`, and a `FontProvider` in `@tallyui/components` that loads the chosen set through an app-supplied loader so `Text` draws its body or numbers face. No font files ship in the packages; each app bundles the OFL files and passes `loadFonts`.
