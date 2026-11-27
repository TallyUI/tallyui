# @tallyui/primitives

## 5.5.0

## 5.4.0

## 5.3.0

## 5.2.0

## 5.1.0

## 5.0.0

### Patch Changes

- 322fc9a: The packed types now load the `className` augmentation for react-native (`ViewProps`, `TextProps` and others), so an app that installs from npm no longer gets TS2322 on `<HStack className>`.
  An app that declares its own `className?: string` is unaffected. An app that declares `ViewProps.dataSet`, or one of the same props with a different type, must match ours.

## 4.2.0

## 4.1.0

### Patch Changes

- 26573b4: `PortalHost` keys each portal by name, so a closing dialog no longer remounts a dialog opened while it animates out.

## 4.0.1

## 4.0.0

### Minor Changes

- 6929703: On web, Escape now closes an open Select, DropdownMenu (an open sub menu first) and Combobox list through the same layer stack as Popover and Dialog, so one Escape closes only the topmost layer. Select and DropdownMenu `Content` now honour their `onEscapeKeyDown` prop, and Combobox `Content` gains it; call `event.preventDefault()` there to keep the list open. Native is unchanged.
- 3dea768: On web, an open `Popover.Content` closes on Escape and on a pointerdown outside its content and trigger, and calls `onEscapeKeyDown` and `onPointerDownOutside` first (`preventDefault()` keeps it open). Only the topmost open popover or dialog reacts. With a `Popover.Overlay` mounted, an outside press is still the Overlay's to handle.

### Patch Changes

- 0b3edbb: Combobox's list opens under its input (or trigger), at least its width, inside a centred Dialog too.
- 1455e76: A click on a Combobox input inside its trigger opens the list and leaves it open.
- e19664f: Keep force-mounted popovers at their last position while closed and stop their dismissal listeners.
  Fade the cart line keypad in and out over 200 ms, stopping keyboard input as soon as it closes.
- 2b00532: Floating content: each popover, select or menu gets its own position style, so opening one no longer moves another.
- ce450d7: Select, DropdownMenu, HoverCard, Tooltip and ContextMenu inside a centred Dialog open against their trigger on web.
- 290cf51: On web, a Popover opened from inside a centred Dialog is placed against its trigger.
- f1748d1: On web, floating content (Popover, Select, DropdownMenu, Tooltip, HoverCard, ContextMenu) is positioned beside its trigger inside the window instead of rendering in the page flow.
- 968782d: Select: the open list is now at least as wide as its trigger, as in WCPOS v2.

## 3.20.1

## 3.20.0

## 3.19.0

### Minor Changes

- e857cf2: `Tooltip.Trigger` now opens the way the docs describe (#749): hovering opens it after `Tooltip.Root`'s `delayDuration` (default `0`, now read), leaving closes it, keyboard focus opens it and blur closes it; the focus a mouse press causes does not open it. A press no longer opens a tooltip, so a tooltip-wrapped button such as `CameraScanButton` stops showing its tooltip on press; a press still closes an open tooltip and then calls the trigger's `onPress`. The new `openOnPress` prop (default `false`) brings back press-to-toggle for a trigger that does nothing else; on touch, where there is no hover, the tooltip opens only with `openOnPress`. The trigger's own `onHoverIn`, `onHoverOut`, `onFocus` and `onBlur` are still called and `onLongPress` passes through untouched, a pending hover delay is cancelled by leaving, by a press and by unmounting, and a disabled trigger opens on none of these.

## 3.18.0

## 3.17.0

## 3.16.0

## 3.15.0

## 3.14.0

## 3.13.0

## 3.12.0

## 3.11.0

### Patch Changes

- 1cebe19: Drop dead re-exports from internal modules. The package entry points export the same names as before.
- 9f84f24: Drop unused devDependencies (`@testing-library/jest-dom`, `tailwindcss`). No runtime change.

## 3.10.0

> **Storage, one way: `pos_orders` moves from schema version 8 to 9.** Every stored order is kept byte for byte, but a till that goes back to a build on version 8 shows no orders and sends none of its pending ones until it is upgraded again. Nothing is deleted.

## 3.9.2

## 3.9.1

## 3.9.0

### Patch Changes

- c1bf800: Every exports entry gains a `default` condition so CommonJS and `require`-condition resolvers (Node `require`, webpack, Snack's bundler) resolve the packages; `smoke:pack` checks `require.resolve` for every entry.

## 3.8.0

## 3.7.1

### Patch Changes

- 9b084a1: The Slider now moves. Pressing or dragging on it sets the value from the pointer, snapped to `step` and clamped to `min`..`max`. With the thumb focused, Arrow keys move one step, Page Up/Down move ten steps, and Home/End go to `min`/`max`. The Range's width and the Thumb's position follow the value: the primitive gives `Range` a default `width` and `Thumb` a default `position: absolute; left`, and a caller's own style still wins. The slider context gains `percent`. `disabled` ignores the pointer and the keys, and the styled `Slider` dims when disabled. (#491)

## 3.7.0

## 3.6.0

## 3.5.3

## 3.5.2

## 3.5.1

## 3.5.0

## 3.4.0

## 3.3.0

## 3.2.1

## 3.2.0

## 3.1.1

## 3.1.0

## 3.0.4

## 3.0.3

## 3.0.2

## 3.0.1

### Patch Changes

- 2416b21: A Dialog now closes on an overlay press and, on web, on Escape (the topmost dialog only; `closeOnPress={false}` or `onEscapeKeyDown` + `preventDefault()` keep it open), and RegisterPanel has a close button, so the register panel can be dismissed on web.

## 3.0.0

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

## 2.0.0

### Minor Changes

- [#25](https://github.com/TallyUI/tallyui/pull/25) [`6ef7eb5`](https://github.com/TallyUI/tallyui/commit/6ef7eb50cc7bd4c87a4440b06fe5ffb3073a7443) Thanks [@kilbot](https://github.com/kilbot)! - The @tallyui/primitives package is now published.

### Patch Changes

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files
