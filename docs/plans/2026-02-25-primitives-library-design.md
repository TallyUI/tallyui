# TallyUI Primitives Library Design

## Overview

A new `@tallyui/primitives` package providing headless, accessible, cross-platform UI primitives. Forked from rn-primitives as a starting point, with full ownership to fix known issues, add performance primitives, and build thorough cross-platform testing.

**Relationship to existing packages:**
- `@tallyui/primitives` — Headless behavior, accessibility, platform abstraction. No styling.
- `@tallyui/components` — Styled components consuming primitives. Applies theme tokens via Tailwind/Uniwind.

## Architecture

### Package Structure

```
packages/primitives/
├── src/
│   ├── index.ts                    # Public exports
│   │
│   ├── infrastructure/             # Forked from rn-primitives, foundation for everything
│   │   ├── slot/                   # asChild composition pattern
│   │   ├── portal/                 # Portal rendering system
│   │   ├── hooks/                  # useControllableState, useAugmentedRef, useRelativePosition
│   │   ├── types/                  # Shared TypeScript types
│   │   └── utils/                  # mergeProps, composeRefs, style utilities
│   │
│   ├── primitives/                 # Interaction primitives (forked from rn-primitives)
│   │   ├── accordion/
│   │   ├── alert-dialog/
│   │   ├── checkbox/
│   │   ├── collapsible/
│   │   ├── combobox/
│   │   ├── context-menu/
│   │   ├── dialog/
│   │   ├── dropdown-menu/
│   │   ├── hover-card/
│   │   ├── label/
│   │   ├── popover/
│   │   ├── progress/
│   │   ├── radio-group/
│   │   ├── select/
│   │   ├── separator/
│   │   ├── slider/
│   │   ├── switch/
│   │   ├── tabs/
│   │   ├── toast/
│   │   ├── toggle/
│   │   ├── toggle-group/
│   │   └── tooltip/
│   │
│   └── performance/                # New performance primitives
│       ├── list/                   # Virtualized list (FlashList native / TanStack Virtual web)
│       ├── image/                  # Optimized image (Expo Image native / <img> web)
│       ├── table/                  # Data table (TanStack Table)
│       └── animated/              # Animation primitives (Reanimated)
```

### Per-Primitive Structure

Each primitive follows a consistent multi-target pattern:

```
primitives/dialog/
├── index.ts              # Entry point, re-exports universal
├── dialog.tsx            # Default (native) implementation
├── dialog.web.tsx        # Web implementation (Metro/bundler resolves automatically)
├── types.ts              # Shared types for this primitive
└── __tests__/
    ├── dialog.test.tsx   # Unit + accessibility tests
    └── dialog.e2e.ts     # E2E test definitions
```

### API Pattern

All primitives use the compound component pattern with context, matching rn-primitives conventions:

```tsx
import { Dialog } from '@tallyui/primitives';

<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger>
    <Button>Open</Button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

Key API principles:
- **asChild via Slot** — All trigger/interactive elements support `asChild` for composition
- **Controllable state** — All stateful primitives support both controlled and uncontrolled usage via `useControllableState`
- **Platform props** — `native` and `web` prop namespaces for platform-specific overrides
- **testID / nativeID** — All interactive elements accept `testID` and `nativeID` for automation and accessibility linking

### Cross-Platform Strategy (Performance Primitives)

Unified API, platform-specific internals:

| Primitive | Native Implementation | Web Implementation |
|-----------|----------------------|-------------------|
| List | @shopify/flash-list | @tanstack/react-virtual |
| Image | expo-image | Native `<img>` via react-native-web |
| Table | @tanstack/react-table | @tanstack/react-table (shared) |
| Animated | react-native-reanimated | react-native-reanimated (web support) |

Consumers import one API. Bundler resolves platform files automatically.

## Testing Strategy

### Three-Tier Testing

**Tier 1 — Primitives (this package)**
- Unit + accessibility: Vitest + React Testing Library + accessibility matchers
- Every primitive gets tests for: open/close states, keyboard navigation, ARIA attributes, focus management, nativeID/testID presence
- Cross-platform: Tests run against both native and web renderers
- E2E: Maestro (native) / Playwright (web) tests for critical primitives (Dialog, Select, Popover, Dropdown Menu — the ones with known platform issues)

**Tier 2 — @tallyui/components**
- Verify styled layer doesn't break primitive behavior
- Theme token application tests
- Visual regression (optional, future)

**Tier 3 — Apps (demo app)**
- Full E2E flows on real simulators/devices
- Maestro test suites for iOS + Android
- Playwright for web

### Interactive Test Screens

The demo app gets a "Primitives" section with a test page per primitive. Each page exercises all states and interactions for manual verification on any device. Serves as both documentation and a manual QA surface.

### What Testing Catches

| Issue Type | Caught By |
|-----------|-----------|
| Dropdown doesn't open on Android | Tier 1 E2E (Maestro) |
| Portal renders behind content on web | Tier 1 E2E (Playwright) |
| Missing ARIA attributes | Tier 1 unit tests |
| nativeID not set for automation | Tier 1 unit tests |
| Styled Select loses keyboard nav | Tier 2 tests |
| Checkout flow broken on iPad | Tier 3 E2E |

## Implementation Phases

### Phase 1 — Foundation + High-Priority Primitives

Infrastructure (fork from rn-primitives):
- Slot, Portal, hooks, types, utils

Most-used interaction primitives:
- Dialog, Select, Popover, Tabs, Dropdown Menu

Performance primitives:
- List (virtualized), Image

Testing setup:
- Vitest + RTL config, Maestro scaffold, interactive test screens in demo app

### Phase 2 — Remaining Primitives

Interaction primitives:
- Accordion, Alert Dialog, Checkbox, Collapsible, Combobox, Context Menu, Hover Card, Label, Progress, Radio Group, Separator, Slider, Switch, Toast, Toggle, Toggle Group, Tooltip

Performance primitives:
- Table (TanStack Table), Animated (Reanimated)

### Future Considerations

- **Expo UI** — As Expo UI components mature, individual primitives can be swapped out. The unified API means consumers don't change.
- **Additional primitives** — Panels (resizable), Tree, DND can be added as needed.
- **Storybook** — Could replace or supplement the interactive test screens if the team grows.

## Dependencies

```json
{
  "dependencies": {},
  "peerDependencies": {
    "react": ">=18",
    "react-native": ">=0.76"
  },
  "optionalDependencies": {
    "@shopify/flash-list": ">=1.7",
    "expo-image": ">=2.0",
    "@tanstack/react-virtual": ">=3.0",
    "@tanstack/react-table": ">=8.0",
    "react-native-reanimated": ">=3.0"
  }
}
```

Performance primitive dependencies are optional/peer — consumers install what they need. Interaction primitives have zero external dependencies beyond React and React Native.

## Build

- **Bundler:** tsup (consistent with other packages)
- **Output:** ESM, TypeScript declarations
- **Entry points:** Single `src/index.ts` with tree-shakeable named exports
- **Platform resolution:** `.web.tsx` / `.tsx` convention (handled by Metro/webpack)
