# TallyUI Primitives Library Implementation Plan

> **For Claude:** REQUIRED: Use /execute-plan to implement this plan task-by-task.

**Goal:** Create `@tallyui/primitives` — a headless, accessible, cross-platform UI primitives package forked from rn-primitives, with thorough testing at every layer.

**Architecture:** Fork rn-primitives infrastructure and interaction primitives into a single `packages/primitives` package. Add new performance primitives (List, Image) with unified APIs over platform-specific implementations (FlashList/TanStack Virtual, Expo Image/img). All primitives are headless — `@tallyui/components` handles styling.

**Tech Stack:** TypeScript, React 18+, React Native 0.76+, Vitest, React Testing Library, @shopify/flash-list, @tanstack/react-virtual, expo-image, tsup

**Source references:**
- rn-primitives: `/Users/kilbot/Projects/rn-primitives/packages/`
- rn-primitives-extras: `/Users/kilbot/Projects/rn-primitives-extras/packages/`
- wcpos components: `/Users/kilbot/Projects/monorepo/packages/components/`

---

## Task 1: Package Scaffold

**Files:**
- Create: `packages/primitives/package.json`
- Create: `packages/primitives/tsup.config.ts`
- Create: `packages/primitives/tsconfig.json`
- Create: `packages/primitives/src/index.ts`
- Modify: `vitest.config.ts` (add primitives alias)

**Step 1: Create package.json**

```json
{
  "name": "@tallyui/primitives",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zustand": "^5.0.3"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-native": ">=0.76.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@types/react": "^19.0.0",
    "tsup": "^8.4.0",
    "typescript": "^5.8.3",
    "vitest": "^4.0.18"
  }
}
```

**Step 2: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  external: ['react', 'react-native', 'zustand'],
});
```

**Step 3: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 4: Create empty src/index.ts**

```typescript
// @tallyui/primitives
// Headless, accessible, cross-platform UI primitives
```

**Step 5: Add alias to vitest.config.ts**

Add `'@tallyui/primitives': resolve(__dirname, 'packages/primitives/src')` to the alias map in `vitest.config.ts`.

**Step 6: Install dependencies and verify build**

Run: `pnpm install && pnpm -F @tallyui/primitives build`
Expected: Clean build, `dist/` directory created

**Step 7: Commit**

```bash
git add packages/primitives/ vitest.config.ts
git commit -m "feat(primitives): scaffold @tallyui/primitives package"
```

---

## Task 2: Infrastructure — Types

Fork `@rn-primitives/types` with cleanup.

**Files:**
- Create: `packages/primitives/src/types.ts`
- Test: `packages/primitives/src/__tests__/types.test-d.ts`

**Step 1: Write type tests**

```typescript
// packages/primitives/src/__tests__/types.test-d.ts
import { describe, expectTypeOf, it } from 'vitest';
import type {
  Prettify,
  SlottableViewProps,
  SlottablePressableProps,
  SlottableTextProps,
  Insets,
  PositionedContentProps,
  ForceMountable,
} from '../types';

describe('Prettify', () => {
  it('flattens intersection types', () => {
    type A = { a: string } & { b: number };
    type Result = Prettify<A>;
    expectTypeOf<Result>().toEqualTypeOf<{ a: string; b: number }>();
  });
});

describe('SlottableViewProps', () => {
  it('includes asChild prop', () => {
    expectTypeOf<SlottableViewProps>().toHaveProperty('asChild');
  });
  it('includes children prop', () => {
    expectTypeOf<SlottableViewProps>().toHaveProperty('children');
  });
});

describe('SlottablePressableProps', () => {
  it('includes asChild prop', () => {
    expectTypeOf<SlottablePressableProps>().toHaveProperty('asChild');
  });
});

describe('PositionedContentProps', () => {
  it('has positioning props', () => {
    expectTypeOf<PositionedContentProps>().toHaveProperty('align');
    expectTypeOf<PositionedContentProps>().toHaveProperty('side');
    expectTypeOf<PositionedContentProps>().toHaveProperty('sideOffset');
    expectTypeOf<PositionedContentProps>().toHaveProperty('avoidCollisions');
  });
});
```

**Step 2: Run type tests to verify they fail**

Run: `pnpm -F @tallyui/primitives test -- --typecheck`
Expected: FAIL — types don't exist yet

**Step 3: Implement types**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/types/src/index.ts`. Copy and clean up:

```typescript
// packages/primitives/src/types.ts
import type { ViewProps, PressableProps, TextProps, ImageProps, ViewStyle } from 'react-native';

// -- Utility types --

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

// -- Slottable types (asChild pattern) --

export interface Slottable {
  asChild?: boolean;
}

export type SlottableViewProps = ViewProps & Slottable & {
  children?: React.ReactNode;
};

export type SlottablePressableProps = PressableProps & Slottable & {
  children?: React.ReactNode;
};

export type SlottableTextProps = TextProps & Slottable & {
  children?: React.ReactNode;
};

export type SlottableImageProps = ImageProps & Slottable;

// -- Ref types --

export type ViewRef = React.RefObject<import('react-native').View | null>;
export type PressableRef = React.RefObject<import('react-native').View | null>;
export type TextRef = React.RefObject<import('react-native').Text | null>;
export type ImageRef = React.RefObject<import('react-native').Image | null>;

// -- Positioning types --

export interface Insets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface PositionedContentProps {
  forceMount?: true;
  style?: ViewStyle;
  alignOffset?: number;
  insets?: Insets;
  avoidCollisions?: boolean;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  sideOffset?: number;
  disablePositioningStyle?: boolean;
}

export interface ForceMountable {
  forceMount?: true;
}

// -- Event types --

export type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>;
export type FocusOutsideEvent = CustomEvent<{ originalEvent: FocusEvent }>;
```

**Step 4: Export from index.ts**

```typescript
export * from './types';
```

**Step 5: Run type tests to verify they pass**

Run: `pnpm -F @tallyui/primitives test -- --typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/types.ts packages/primitives/src/__tests__/types.test-d.ts packages/primitives/src/index.ts
git commit -m "feat(primitives): add shared type definitions"
```

---

## Task 3: Infrastructure — Slot (asChild Pattern)

Fork `@rn-primitives/slot`.

**Files:**
- Create: `packages/primitives/src/slot.tsx`
- Test: `packages/primitives/src/__tests__/slot.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/slot.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { View, Text, Pressable } from 'react-native';
import { Slot } from '../slot';

describe('Slot', () => {
  it('renders children directly when asChild is not used', () => {
    // Slot without asChild should just render its children
    render(<Slot><Text testID="child">Hello</Text></Slot>);
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('merges props onto child element', () => {
    render(
      <Slot testID="slot-test">
        <View><Text>Content</Text></View>
      </Slot>
    );
    expect(screen.getByTestId('slot-test')).toBeTruthy();
  });

  it('composes event handlers', () => {
    const slotHandler = vi.fn();
    const childHandler = vi.fn();

    render(
      <Slot onPress={slotHandler}>
        <Pressable testID="btn" onPress={childHandler}>
          <Text>Click</Text>
        </Pressable>
      </Slot>
    );

    fireEvent.press(screen.getByTestId('btn'));
    expect(slotHandler).toHaveBeenCalledTimes(1);
    expect(childHandler).toHaveBeenCalledTimes(1);
  });

  it('merges className strings', () => {
    render(
      <Slot className="slot-class">
        <View testID="el" className="child-class"><Text>Hi</Text></View>
      </Slot>
    );
    const el = screen.getByTestId('el');
    expect(el.props.className).toContain('slot-class');
    expect(el.props.className).toContain('child-class');
  });

  it('throws on text-only children', () => {
    expect(() => {
      render(<Slot>plain text</Slot>);
    }).toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- packages/primitives/src/__tests__/slot.test.tsx`
Expected: FAIL — Slot doesn't exist

**Step 3: Implement Slot**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/slot/src/slot.tsx`. Key functions:
- `Slot` component — clones child element with merged props
- `composeRefs` — combines multiple refs
- `mergeProps` — merges props with handler composition
- `combineStyles` — merges RN styles including Pressable state callbacks

```typescript
// packages/primitives/src/slot.tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import type { PressableStateCallbackType } from 'react-native';

// Copy implementation from rn-primitives slot.tsx
// Key exports: Slot, composeRefs, mergeProps
```

Refer to `/Users/kilbot/Projects/rn-primitives/packages/slot/src/slot.tsx` for the complete implementation. Fork it directly, removing deprecated Slot.View/Slot.Text/etc sub-exports.

**Step 4: Export from index.ts**

Add: `export { Slot, composeRefs, mergeProps } from './slot';`

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- packages/primitives/src/__tests__/slot.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/slot.tsx packages/primitives/src/__tests__/slot.test.tsx packages/primitives/src/index.ts
git commit -m "feat(primitives): add Slot component (asChild pattern)"
```

---

## Task 4: Infrastructure — Hooks

Fork `@rn-primitives/hooks`.

**Files:**
- Create: `packages/primitives/src/hooks/use-controllable-state.ts`
- Create: `packages/primitives/src/hooks/use-augmented-ref.ts`
- Create: `packages/primitives/src/hooks/use-relative-position.ts`
- Create: `packages/primitives/src/hooks/use-relative-position.web.ts`
- Create: `packages/primitives/src/hooks/index.ts`
- Test: `packages/primitives/src/__tests__/hooks.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/hooks.test.tsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useControllableState, useAugmentedRef } from '../hooks';

describe('useControllableState', () => {
  it('works in uncontrolled mode with defaultProp', () => {
    const { result } = renderHook(() =>
      useControllableState({ defaultProp: false })
    );
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });

  it('works in controlled mode with prop', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({ prop: true, onChange })
    );
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('calls onChange when uncontrolled value changes', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({ defaultProp: 'a', onChange })
    );

    act(() => result.current[1]('b'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('useAugmentedRef', () => {
  it('adds methods to ref', () => {
    const ref = { current: null };
    const open = vi.fn();
    const close = vi.fn();

    renderHook(() =>
      useAugmentedRef({ ref, methods: { open, close } })
    );

    // After render, ref should have the methods
    expect(ref.current).toHaveProperty('open');
    expect(ref.current).toHaveProperty('close');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- packages/primitives/src/__tests__/hooks.test.tsx`
Expected: FAIL

**Step 3: Implement hooks**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/hooks/src/`:
- `use-controllable-state.tsx` → `use-controllable-state.ts`
- `use-augmented-ref.tsx` → `use-augmented-ref.ts`
- `use-relative-position.tsx` → `use-relative-position.ts` (native)
- `use-relative-position.web.tsx` → `use-relative-position.web.ts` (web stub)

Create index barrel:

```typescript
// packages/primitives/src/hooks/index.ts
export { useControllableState } from './use-controllable-state';
export { useAugmentedRef } from './use-augmented-ref';
export { useRelativePosition, type LayoutPosition } from './use-relative-position';
```

**Step 4: Export from index.ts**

Add: `export { useControllableState, useAugmentedRef, useRelativePosition } from './hooks';`

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- packages/primitives/src/__tests__/hooks.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/hooks/ packages/primitives/src/__tests__/hooks.test.tsx packages/primitives/src/index.ts
git commit -m "feat(primitives): add hooks (useControllableState, useAugmentedRef, useRelativePosition)"
```

---

## Task 5: Infrastructure — Portal

Fork `@rn-primitives/portal`.

**Files:**
- Create: `packages/primitives/src/portal.tsx`
- Test: `packages/primitives/src/__tests__/portal.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/portal.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text } from 'react-native';
import { Portal, PortalHost } from '../portal';

describe('Portal', () => {
  it('renders children at PortalHost location', () => {
    render(
      <>
        <PortalHost />
        <Portal name="test-portal">
          <Text testID="portaled">Portaled content</Text>
        </Portal>
      </>
    );
    expect(screen.getByTestId('portaled')).toBeTruthy();
  });

  it('renders nothing at original location', () => {
    const { container } = render(
      <>
        <PortalHost />
        <Portal name="test-portal-2">
          <Text>Portaled</Text>
        </Portal>
      </>
    );
    // Portal component itself returns null
    // Content appears at PortalHost
  });

  it('supports named hosts', () => {
    render(
      <>
        <PortalHost name="host-a" />
        <PortalHost name="host-b" />
        <Portal name="p1" hostName="host-b">
          <Text testID="in-b">In B</Text>
        </Portal>
      </>
    );
    expect(screen.getByTestId('in-b')).toBeTruthy();
  });

  it('cleans up on unmount', () => {
    const { unmount, rerender } = render(
      <>
        <PortalHost />
        <Portal name="cleanup-test">
          <Text testID="cleanup-content">Content</Text>
        </Portal>
      </>
    );
    expect(screen.getByTestId('cleanup-content')).toBeTruthy();

    // Re-render without Portal
    rerender(<PortalHost />);
    expect(screen.queryByTestId('cleanup-content')).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- packages/primitives/src/__tests__/portal.test.tsx`
Expected: FAIL

**Step 3: Implement Portal**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/portal/src/portal.tsx`. Uses Zustand store with nested Map for host → portal → content registry.

**Step 4: Export from index.ts**

Add: `export { Portal, PortalHost } from './portal';`

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- packages/primitives/src/__tests__/portal.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/portal.tsx packages/primitives/src/__tests__/portal.test.tsx packages/primitives/src/index.ts
git commit -m "feat(primitives): add Portal and PortalHost components"
```

---

## Task 6: Infrastructure — Utils

Fork useful utilities from `@rn-primitives/utils`.

**Files:**
- Create: `packages/primitives/src/utils.ts`
- Test: `packages/primitives/src/__tests__/utils.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/primitives/src/__tests__/utils.test.ts
import { describe, it, expect, vi } from 'vitest';
import { toggleGroupUtils } from '../utils';

describe('toggleGroupUtils', () => {
  describe('getIsSelected', () => {
    it('returns true for matching single value', () => {
      expect(toggleGroupUtils.getIsSelected('a', 'a')).toBe(true);
    });
    it('returns true for value in array', () => {
      expect(toggleGroupUtils.getIsSelected(['a', 'b'], 'b')).toBe(true);
    });
    it('returns false for non-matching value', () => {
      expect(toggleGroupUtils.getIsSelected('a', 'b')).toBe(false);
    });
  });

  describe('getNewSingleValue', () => {
    it('deselects when already selected', () => {
      expect(toggleGroupUtils.getNewSingleValue('a', 'a')).toBeUndefined();
    });
    it('selects new value', () => {
      expect(toggleGroupUtils.getNewSingleValue('a', 'b')).toBe('b');
    });
  });

  describe('getNewMultipleValue', () => {
    it('adds value when not present', () => {
      expect(toggleGroupUtils.getNewMultipleValue(['a'], 'b')).toEqual(['a', 'b']);
    });
    it('removes value when present', () => {
      expect(toggleGroupUtils.getNewMultipleValue(['a', 'b'], 'b')).toEqual(['a']);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- packages/primitives/src/__tests__/utils.test.ts`
Expected: FAIL

**Step 3: Implement utils**

Fork `ToggleGroupUtils` from `/Users/kilbot/Projects/rn-primitives/packages/utils/src/toggle-group-utils.ts` and `EmptyGestureResponderEvent` from `/Users/kilbot/Projects/rn-primitives/packages/utils/src/empty-gesture-responder-event.ts`.

```typescript
// packages/primitives/src/utils.ts
export const toggleGroupUtils = {
  getIsSelected(value: string | string[] | undefined, itemValue: string): boolean { ... },
  getNewSingleValue(original: string | string[] | undefined, itemValue: string): string | undefined { ... },
  getNewMultipleValue(original: string | string[] | undefined, itemValue: string): string[] { ... },
};

export const EmptyGestureResponderEvent = { ... };
```

**Step 4: Export from index.ts**

Add: `export { toggleGroupUtils, EmptyGestureResponderEvent } from './utils';`

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- packages/primitives/src/__tests__/utils.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/utils.ts packages/primitives/src/__tests__/utils.test.ts packages/primitives/src/index.ts
git commit -m "feat(primitives): add utility functions"
```

---

## Task 7: Dialog Primitive

Fork `@rn-primitives/dialog`. This is the template for all subsequent interaction primitives.

**Files:**
- Create: `packages/primitives/src/dialog/index.ts`
- Create: `packages/primitives/src/dialog/types.ts`
- Create: `packages/primitives/src/dialog/dialog.tsx`
- Create: `packages/primitives/src/dialog/dialog.web.tsx`
- Test: `packages/primitives/src/__tests__/dialog.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/dialog.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Text, View } from 'react-native';
import * as Dialog from '../dialog';
import { PortalHost } from '../portal';

describe('Dialog', () => {
  const renderDialog = (props = {}) =>
    render(
      <>
        <PortalHost />
        <Dialog.Root {...props}>
          <Dialog.Trigger testID="trigger">
            <Text>Open</Text>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay testID="overlay" />
            <Dialog.Content testID="content">
              <Dialog.Title testID="title">Dialog Title</Dialog.Title>
              <Dialog.Description testID="description">
                Dialog description
              </Dialog.Description>
              <Dialog.Close testID="close">
                <Text>Close</Text>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </>
    );

  it('is closed by default', () => {
    renderDialog();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('opens when trigger is pressed', () => {
    renderDialog();
    fireEvent.press(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes when close is pressed', () => {
    renderDialog({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.press(screen.getByTestId('close'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled open state', () => {
    const onOpenChange = vi.fn();
    renderDialog({ open: false, onOpenChange });
    fireEvent.press(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('renders with correct ARIA attributes', () => {
    renderDialog({ defaultOpen: true });
    const content = screen.getByTestId('content');
    expect(content.props.role).toBe('dialog');
    expect(content.props['aria-labelledby']).toBeTruthy();
    expect(content.props['aria-describedby']).toBeTruthy();
  });

  it('title has role heading', () => {
    renderDialog({ defaultOpen: true });
    const title = screen.getByTestId('title');
    expect(title.props.role).toBe('heading');
  });

  it('trigger has role button', () => {
    renderDialog();
    const trigger = screen.getByTestId('trigger');
    expect(trigger.props.role).toBe('button');
  });

  it('links title and description via nativeID', () => {
    renderDialog({ defaultOpen: true });
    const content = screen.getByTestId('content');
    const title = screen.getByTestId('title');
    const description = screen.getByTestId('description');
    expect(content.props['aria-labelledby']).toBe(title.props.nativeID);
    expect(content.props['aria-describedby']).toBe(description.props.nativeID);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- packages/primitives/src/__tests__/dialog.test.tsx`
Expected: FAIL

**Step 3: Implement Dialog**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/dialog/src/`. Use the native implementation as the base (`dialog-native.native.tsx`). Create:

- `types.ts` — prop types for Root, Trigger, Portal, Overlay, Content, Title, Description, Close
- `dialog.tsx` — native implementation with compound components
- `dialog.web.tsx` — web implementation wrapping `@radix-ui/react-dialog`
- `index.ts` — re-exports

Key components: Root, Trigger, Portal, Overlay, Content, Title, Description, Close.

Each must include `testID` pass-through and proper ARIA attributes (role, aria-labelledby, aria-describedby, aria-modal, nativeID).

**Step 4: Export from main index.ts**

Add: `export * as Dialog from './dialog';`

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- packages/primitives/src/__tests__/dialog.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/dialog/ packages/primitives/src/__tests__/dialog.test.tsx packages/primitives/src/index.ts
git commit -m "feat(primitives): add Dialog primitive"
```

---

## Task 8: Select Primitive

Fork `@rn-primitives/select`.

**Files:**
- Create: `packages/primitives/src/select/index.ts`
- Create: `packages/primitives/src/select/types.ts`
- Create: `packages/primitives/src/select/select.tsx`
- Create: `packages/primitives/src/select/select.web.tsx`
- Test: `packages/primitives/src/__tests__/select.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/select.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'react-native';
import * as Select from '../select';
import { PortalHost } from '../portal';

describe('Select', () => {
  const options = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
  ];

  const renderSelect = (props = {}) =>
    render(
      <>
        <PortalHost />
        <Select.Root {...props}>
          <Select.Trigger testID="trigger">
            <Select.Value testID="value" placeholder="Pick a fruit" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content testID="content">
              {options.map((opt) => (
                <Select.Item key={opt.value} value={opt.value} label={opt.label} testID={`item-${opt.value}`}>
                  <Select.ItemText />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </>
    );

  it('shows placeholder when no value selected', () => {
    renderSelect();
    expect(screen.getByText('Pick a fruit')).toBeTruthy();
  });

  it('trigger has combobox role', () => {
    renderSelect();
    expect(screen.getByTestId('trigger').props.role).toBe('combobox');
  });

  it('opens on trigger press', () => {
    renderSelect();
    fireEvent.press(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('selects an item', () => {
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });
    fireEvent.press(screen.getByTestId('trigger'));
    fireEvent.press(screen.getByTestId('item-apple'));
    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'apple', label: 'Apple' })
    );
  });

  it('items have option role', () => {
    renderSelect({ defaultOpen: true });
    // Need to open first for items to render
    const item = screen.getByTestId('item-apple');
    expect(item.props.role).toBe('option');
  });

  it('content has list role', () => {
    renderSelect({ defaultOpen: true });
    expect(screen.getByTestId('content').props.role).toBe('list');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- packages/primitives/src/__tests__/select.test.tsx`
Expected: FAIL

**Step 3: Implement Select**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/select/src/`. Components: Root, Trigger, Value, Portal, Overlay, Content, Item, ItemText, ItemIndicator, Group, Label, Separator.

Key: Uses `useRelativePosition` for native positioning, `useControllableState` for value management. The `IRootContext` tracks `triggerPosition` and `contentLayout` for positioning calculations.

**Step 4: Export from main index.ts**

Add: `export * as Select from './select';`

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- packages/primitives/src/__tests__/select.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/select/ packages/primitives/src/__tests__/select.test.tsx packages/primitives/src/index.ts
git commit -m "feat(primitives): add Select primitive"
```

---

## Task 9: Popover Primitive

Fork `@rn-primitives/popover`.

**Files:**
- Create: `packages/primitives/src/popover/index.ts`
- Create: `packages/primitives/src/popover/types.ts`
- Create: `packages/primitives/src/popover/popover.tsx`
- Create: `packages/primitives/src/popover/popover.web.tsx`
- Test: `packages/primitives/src/__tests__/popover.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/popover.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'react-native';
import * as Popover from '../popover';
import { PortalHost } from '../portal';

describe('Popover', () => {
  const renderPopover = (props = {}) =>
    render(
      <>
        <PortalHost />
        <Popover.Root {...props}>
          <Popover.Trigger testID="trigger">
            <Text>Open</Text>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Overlay testID="overlay" />
            <Popover.Content testID="content">
              <Text>Popover body</Text>
              <Popover.Close testID="close">
                <Text>Close</Text>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </>
    );

  it('is closed by default', () => {
    renderPopover();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('opens on trigger press', () => {
    renderPopover();
    fireEvent.press(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes on close press', () => {
    renderPopover({ defaultOpen: true });
    fireEvent.press(screen.getByTestId('close'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled state', () => {
    const onOpenChange = vi.fn();
    renderPopover({ open: false, onOpenChange });
    fireEvent.press(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('content has dialog role', () => {
    renderPopover({ defaultOpen: true });
    expect(screen.getByTestId('content').props.role).toBe('dialog');
  });

  it('trigger has button role', () => {
    renderPopover();
    expect(screen.getByTestId('trigger').props.role).toBe('button');
  });
});
```

**Step 2–6: Same TDD cycle as Dialog**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/popover/src/`. Components: Root, Trigger, Portal, Overlay, Content, Close. Uses `useRelativePosition` for native positioning.

Commit: `feat(primitives): add Popover primitive`

---

## Task 10: Tabs Primitive

Fork `@rn-primitives/tabs`.

**Files:**
- Create: `packages/primitives/src/tabs/index.ts`
- Create: `packages/primitives/src/tabs/types.ts`
- Create: `packages/primitives/src/tabs/tabs.tsx`
- Create: `packages/primitives/src/tabs/tabs.web.tsx`
- Test: `packages/primitives/src/__tests__/tabs.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/tabs.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'react-native';
import * as Tabs from '../tabs';

describe('Tabs', () => {
  const renderTabs = (props = {}) =>
    render(
      <Tabs.Root value="tab1" onValueChange={vi.fn()} {...props}>
        <Tabs.List testID="list">
          <Tabs.Trigger value="tab1" testID="trigger-1">
            <Text>Tab 1</Text>
          </Tabs.Trigger>
          <Tabs.Trigger value="tab2" testID="trigger-2">
            <Text>Tab 2</Text>
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1" testID="content-1">
          <Text>Content 1</Text>
        </Tabs.Content>
        <Tabs.Content value="tab2" testID="content-2">
          <Text>Content 2</Text>
        </Tabs.Content>
      </Tabs.Root>
    );

  it('renders active tab content', () => {
    renderTabs();
    expect(screen.getByTestId('content-1')).toBeTruthy();
    expect(screen.queryByTestId('content-2')).toBeNull();
  });

  it('switches tabs on trigger press', () => {
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });
    fireEvent.press(screen.getByTestId('trigger-2'));
    expect(onValueChange).toHaveBeenCalledWith('tab2');
  });

  it('list has tablist role', () => {
    renderTabs();
    expect(screen.getByTestId('list').props.role).toBe('tablist');
  });

  it('triggers have tab role', () => {
    renderTabs();
    expect(screen.getByTestId('trigger-1').props.role).toBe('tab');
  });

  it('active trigger has aria-selected', () => {
    renderTabs();
    expect(screen.getByTestId('trigger-1').props['aria-selected']).toBe(true);
    expect(screen.getByTestId('trigger-2').props['aria-selected']).toBe(false);
  });

  it('content has tabpanel role', () => {
    renderTabs();
    expect(screen.getByTestId('content-1').props.role).toBe('tabpanel');
  });
});
```

**Step 2–6: Same TDD cycle**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/tabs/src/`. Simplest primitive — no positioning needed.

Commit: `feat(primitives): add Tabs primitive`

---

## Task 11: Dropdown Menu Primitive

Fork `@rn-primitives/dropdown-menu`.

**Files:**
- Create: `packages/primitives/src/dropdown-menu/index.ts`
- Create: `packages/primitives/src/dropdown-menu/types.ts`
- Create: `packages/primitives/src/dropdown-menu/dropdown-menu.tsx`
- Create: `packages/primitives/src/dropdown-menu/dropdown-menu.web.tsx`
- Test: `packages/primitives/src/__tests__/dropdown-menu.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/dropdown-menu.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'react-native';
import * as DropdownMenu from '../dropdown-menu';
import { PortalHost } from '../portal';

describe('DropdownMenu', () => {
  const renderMenu = (props = {}) =>
    render(
      <>
        <PortalHost />
        <DropdownMenu.Root {...props}>
          <DropdownMenu.Trigger testID="trigger">
            <Text>Menu</Text>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content testID="content">
              <DropdownMenu.Item testID="item-1" onPress={vi.fn()}>
                <Text>Item 1</Text>
              </DropdownMenu.Item>
              <DropdownMenu.Separator testID="sep" />
              <DropdownMenu.Item testID="item-2" onPress={vi.fn()}>
                <Text>Item 2</Text>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </>
    );

  it('is closed by default', () => {
    renderMenu();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('opens on trigger press', () => {
    renderMenu();
    fireEvent.press(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('content has menu role', () => {
    renderMenu({ defaultOpen: true });
    expect(screen.getByTestId('content').props.role).toBe('menu');
  });

  it('items have menuitem role', () => {
    renderMenu({ defaultOpen: true });
    expect(screen.getByTestId('item-1').props.role).toBe('menuitem');
  });

  it('separator has separator role', () => {
    renderMenu({ defaultOpen: true });
    expect(screen.getByTestId('sep').props.role).toBe('separator');
  });

  it('fires item onPress', () => {
    const onPress = vi.fn();
    render(
      <>
        <PortalHost />
        <DropdownMenu.Root defaultOpen>
          <DropdownMenu.Trigger><Text>M</Text></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>
              <DropdownMenu.Item testID="pressable-item" onPress={onPress}>
                <Text>Click me</Text>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </>
    );
    fireEvent.press(screen.getByTestId('pressable-item'));
    expect(onPress).toHaveBeenCalled();
  });
});
```

**Step 2–6: Same TDD cycle**

Fork from `/Users/kilbot/Projects/rn-primitives/packages/dropdown-menu/src/`. Most complex primitive — includes CheckboxItem, RadioGroup, RadioItem, Sub/SubTrigger/SubContent.

Commit: `feat(primitives): add DropdownMenu primitive`

---

## Task 12: Virtualized List Primitive

Fork from `rn-primitives-extras` virtualized list, enhance with tests.

**Files:**
- Create: `packages/primitives/src/list/index.ts`
- Create: `packages/primitives/src/list/types.ts`
- Create: `packages/primitives/src/list/list.tsx` (FlashList native)
- Create: `packages/primitives/src/list/list.web.tsx` (TanStack Virtual web)
- Test: `packages/primitives/src/__tests__/list.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/list.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'react-native';
import * as List from '../list';

describe('List', () => {
  const data = Array.from({ length: 100 }, (_, i) => ({ id: String(i), label: `Item ${i}` }));

  it('renders items using renderItem', () => {
    render(
      <List.Root
        data={data.slice(0, 5)}
        renderItem={({ item }) => (
          <List.Item testID={`item-${item.id}`}>
            <Text>{item.label}</Text>
          </List.Item>
        )}
        estimatedItemSize={50}
        testID="list"
      />
    );
    expect(screen.getByTestId('item-0')).toBeTruthy();
  });

  it('supports keyExtractor', () => {
    const keyExtractor = vi.fn((item: { id: string }) => item.id);
    render(
      <List.Root
        data={data.slice(0, 3)}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        keyExtractor={keyExtractor}
        estimatedItemSize={50}
      />
    );
    expect(keyExtractor).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- packages/primitives/src/__tests__/list.test.tsx`
Expected: FAIL

**Step 3: Implement List**

Fork from `/Users/kilbot/Projects/rn-primitives-extras/packages/virtualized-list/src/`.

Platform abstraction:
- Native: wraps `@shopify/flash-list` FlashList
- Web: wraps `@tanstack/react-virtual` useVirtualizer with absolute positioning

Unified API:
```typescript
<List.Root
  data={items}
  renderItem={({ item, index }) => <List.Item>...</List.Item>}
  estimatedItemSize={50}
  keyExtractor={(item) => item.id}
/>
```

Add `@shopify/flash-list` and `@tanstack/react-virtual` as optional peer dependencies in package.json.

**Step 4: Export from main index.ts**

Add: `export * as List from './list';`

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- packages/primitives/src/__tests__/list.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/primitives/src/list/ packages/primitives/src/__tests__/list.test.tsx packages/primitives/src/index.ts packages/primitives/package.json
git commit -m "feat(primitives): add virtualized List primitive"
```

---

## Task 13: Image Primitive

Unified image with Expo Image (native) and standard img (web).

**Files:**
- Create: `packages/primitives/src/image/index.ts`
- Create: `packages/primitives/src/image/types.ts`
- Create: `packages/primitives/src/image/image.tsx` (Expo Image native)
- Create: `packages/primitives/src/image/image.web.tsx` (web)
- Test: `packages/primitives/src/__tests__/image.test.tsx`

**Step 1: Write failing tests**

```tsx
// packages/primitives/src/__tests__/image.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import * as Image from '../image';

describe('Image', () => {
  it('renders with source', () => {
    render(
      <Image.Root
        source={{ uri: 'https://example.com/img.png' }}
        testID="image"
        alt="Test image"
      />
    );
    expect(screen.getByTestId('image')).toBeTruthy();
  });

  it('passes alt text for accessibility', () => {
    render(
      <Image.Root
        source={{ uri: 'https://example.com/img.png' }}
        testID="image"
        alt="A product photo"
      />
    );
    const img = screen.getByTestId('image');
    // alt should be set either as accessibilityLabel or alt prop
    expect(
      img.props.alt || img.props.accessibilityLabel
    ).toBe('A product photo');
  });

  it('supports placeholder prop', () => {
    render(
      <Image.Root
        source={{ uri: 'https://example.com/img.png' }}
        placeholder={{ uri: 'https://example.com/placeholder.png' }}
        testID="image"
        alt="test"
      />
    );
    expect(screen.getByTestId('image')).toBeTruthy();
  });
});
```

**Step 2–6: Same TDD cycle**

Native wraps `expo-image` Image component. Web uses react-native-web's Image or standard `<img>`. Add `expo-image` as optional peer dependency.

Commit: `feat(primitives): add Image primitive`

---

## Task 14: Interactive Test Screens in Demo App

Add a "Primitives" section to the demo app for manual testing on real devices.

**Files:**
- Create: `apps/demo/app/(tabs)/primitives/index.tsx` (primitives list)
- Create: `apps/demo/app/(tabs)/primitives/dialog.tsx`
- Create: `apps/demo/app/(tabs)/primitives/select.tsx`
- Create: `apps/demo/app/(tabs)/primitives/popover.tsx`
- Create: `apps/demo/app/(tabs)/primitives/tabs.tsx`
- Create: `apps/demo/app/(tabs)/primitives/dropdown-menu.tsx`
- Create: `apps/demo/app/(tabs)/primitives/list.tsx`
- Create: `apps/demo/app/(tabs)/primitives/image.tsx`

**Step 1: Create primitives index screen**

```tsx
// apps/demo/app/(tabs)/primitives/index.tsx
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Link } from 'expo-router';

const primitives = [
  { name: 'Dialog', href: '/primitives/dialog' },
  { name: 'Select', href: '/primitives/select' },
  { name: 'Popover', href: '/primitives/popover' },
  { name: 'Tabs', href: '/primitives/tabs' },
  { name: 'Dropdown Menu', href: '/primitives/dropdown-menu' },
  { name: 'List', href: '/primitives/list' },
  { name: 'Image', href: '/primitives/image' },
];

export default function PrimitivesIndex() {
  return (
    <ScrollView>
      <Text>Primitives Test Screens</Text>
      {primitives.map((p) => (
        <Link key={p.name} href={p.href} asChild>
          <Pressable>
            <Text>{p.name}</Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
```

**Step 2: Create individual test screens**

Each screen renders the primitive in various states: default, open, disabled, controlled, with different props. Example for Dialog:

```tsx
// apps/demo/app/(tabs)/primitives/dialog.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import * as Dialog from '@tallyui/primitives/dialog';
import { PortalHost } from '@tallyui/primitives';

export default function DialogTest() {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Text>Dialog Tests</Text>

      {/* Uncontrolled */}
      <Dialog.Root>
        <Dialog.Trigger><Text>Uncontrolled Dialog</Text></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>Uncontrolled</Dialog.Title>
            <Dialog.Description>This dialog manages its own state</Dialog.Description>
            <Dialog.Close><Text>Close</Text></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Controlled */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger><Text>Controlled Dialog</Text></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>Controlled</Dialog.Title>
            <Dialog.Description>Open state: {String(open)}</Dialog.Description>
            <Dialog.Close><Text>Close</Text></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <PortalHost />
    </View>
  );
}
```

**Step 3: Add primitives dependency to demo app**

Add `"@tallyui/primitives": "workspace:*"` to `apps/demo/package.json` dependencies.

**Step 4: Verify demo app runs**

Run: `pnpm -F @tallyui/demo dev`
Expected: App loads, primitives test screens accessible

**Step 5: Commit**

```bash
git add apps/demo/app/\(tabs\)/primitives/ apps/demo/package.json
git commit -m "feat(demo): add interactive primitives test screens"
```

---

## Task 15: Run Full Test Suite and Verify Build

**Step 1: Run all primitives tests**

Run: `pnpm test -- packages/primitives/`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `pnpm -F @tallyui/primitives typecheck`
Expected: No type errors

**Step 3: Run build**

Run: `pnpm -F @tallyui/primitives build`
Expected: Clean build, dist/ contains all exports

**Step 4: Run full monorepo build**

Run: `pnpm build`
Expected: All packages build successfully

**Step 5: Commit any fixes**

If any issues found, fix and commit.

---

## Phase 2 Tasks (Future)

After Phase 1 is stable, implement remaining primitives following the same TDD pattern established above:

- Accordion, Alert Dialog, Checkbox, Collapsible, Combobox
- Context Menu, Hover Card, Label, Progress, Radio Group
- Separator, Slider, Switch, Toast, Toggle, Toggle Group, Tooltip
- Table (TanStack Table), Animated (Reanimated)
- Maestro E2E test suite for critical primitives
- Playwright E2E tests for web
