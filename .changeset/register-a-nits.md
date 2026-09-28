---
"@tallyui/components": minor
---

Register-selection screen nits (ADR-032 amendment 1, medusapos adopting `451a0ca`): `RegisterPicker`'s rows now size to their content, with a minimum height, instead of clipping the "Not opened" second line at a fixed `h-11`; `RegisterPicker` and `OpenRegisterCard` no longer hard-code `flex-1`, taking their existing `className` from the caller instead (TallyUI's own `RegisterColumn` still passes `flex-1` where it mounts them); `RegisterPanel`'s sales count now pluralises correctly ("1 sale this session", not "1 sales"); and `OpenRegisterCard`'s amount label names the currency, matching `MovementSheet`'s "Amount (€)" ("Cash in the drawer to start (€)").

Two new optional props for apps that need to put register controls elsewhere on the screen: `RegisterBar` takes an `onPressPill?: () => void` that turns its status pill into a button (opening the gate/picker or the panel), and `Catalogue` takes a `statusAccessory?: ReactNode` rendered at the end of its status line, alongside the status text, so a register control can sit there at phone width.
