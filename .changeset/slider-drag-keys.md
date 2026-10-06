---
"@tallyui/primitives": patch
"@tallyui/components": patch
---

The Slider now moves. Pressing or dragging on it sets the value from the pointer, snapped to `step` and clamped to `min`..`max`. With the thumb focused, Arrow keys move one step, Page Up/Down move ten steps, and Home/End go to `min`/`max`. The Range's width and the Thumb's position follow the value: the primitive gives `Range` a default `width` and `Thumb` a default `position: absolute; left`, and a caller's own style still wins. The slider context gains `percent`. `disabled` ignores the pointer and the keys, and the styled `Slider` dims when disabled. (#491)
