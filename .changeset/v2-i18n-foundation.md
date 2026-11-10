---
'@tallyui/components': minor
---

Components can now be translated: `I18nProvider` takes the store's locale (or uses the device's) and the app's catalogues for other languages, falling back from `fr_CA` to `fr` to the bundled English, and `useT` reads a string by key. The tender pane is the first area to read its strings this way; without a provider it still shows English.
