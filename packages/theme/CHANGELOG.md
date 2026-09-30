# @tallyui/theme

## 3.0.0-next.1

## 3.0.0-next.0

## 2.0.0

### Patch Changes

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files

- [#36](https://github.com/TallyUI/tallyui/pull/36) [`d1bc892`](https://github.com/TallyUI/tallyui/commit/d1bc8920968d6545bc14567fa2a8b47e6706514a) Thanks [@kilbot](https://github.com/kilbot)! - Light theme contrast: primary darkened to #5b5ef0 (white text 4.88:1), muted-foreground to #656c79 and input to #848a94 (control borders ≥ 3:1). Product cards and quick-tender buttons get borders, and components no longer use the undefined `bg-surface-alt` or `text-muted` text classes, so labels such as "Change Due" are legible.

- [#37](https://github.com/TallyUI/tallyui/pull/37) [`12b7723`](https://github.com/TallyUI/tallyui/commit/12b7723041f2297c86525e2ddbab3f39d8bdfa1f) Thanks [@kilbot](https://github.com/kilbot)! - Status colours pass WCAG AA with their foregrounds: light success #047857, warning #b45309, info #2563eb (and price #047857). Dark theme: input borders #636c76 (≥ 3:1), border #3d444d, and destructive text is dark (#0d1117) on the red. The contrast test now covers status colours and the dark theme.

- [#31](https://github.com/TallyUI/tallyui/pull/31) [`78cada7`](https://github.com/TallyUI/tallyui/commit/78cada7843c4a97bc5035e82d93ad91f8b90bd78) Thanks [@kilbot](https://github.com/kilbot)! - `tokens.css` now defines the light theme in a `@variant light` block, alongside `@variant dark`. Uniwind requires every theme to set the same variables, so apps using Uniwind no longer print 27 "Theme light is missing variable" errors per bundle. The file also declares the `light` custom variant, so it still compiles with plain Tailwind 4. Colour values are unchanged.

## 0.2.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling
