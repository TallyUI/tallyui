---
'@tallyui/components': minor
---

`ViewToggle` takes `variant: 'icon'`, WCPOS v2's single view-mode button: one press switches to the other view (testID `view-toggle` on the control and `view-toggle-<next view>` on the button, labels "Switch to grid view" / "Switch to table view"). `Catalogue`'s search row now draws that form, and caps the search field at `max-w-160` on wide windows (not phones: width < 768 or height < 480), as in v2's PageBar, with the row's controls at its right end.
