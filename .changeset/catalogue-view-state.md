---
'@tallyui/pos': minor
'@tallyui/components': minor
---

`Catalogue` can switch between grid and table (`showViewToggle`), take a grid column count, and keep a view state the app controls or persists (`viewState`, `defaultViewState`, `loadViewState`, `saveViewState`, `onStateChange`, `items`, `onQueryChange`); new `ViewToggle` primitive and pure `catalogueViewReducer` / `normalizeCatalogueViewState` / `resolveGridColumns`. Without the new props the Catalogue is unchanged.
