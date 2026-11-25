---
'@tallyui/components': patch
'@tallyui/primitives': patch
---

The packed types now load the `className` augmentation for react-native (`ViewProps`, `TextProps` and others), so an app that installs from npm no longer gets TS2322 on `<HStack className>`.
An app that declares its own `className?: string` is unaffected. An app that declares `ViewProps.dataSet`, or one of the same props with a different type, must match ours.
