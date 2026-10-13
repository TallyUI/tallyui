# @tallyui/primitives

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
