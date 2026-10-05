---
'@tallyui/primitives': patch
'@tallyui/components': patch
---

A Dialog now closes on an overlay press and, on web, on Escape (the topmost dialog only; `closeOnPress={false}` or `onEscapeKeyDown` + `preventDefault()` keep it open), and RegisterPanel has a close button, so the register panel can be dismissed on web.
