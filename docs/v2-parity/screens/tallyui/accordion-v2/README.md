# Accordion: v2's chevron, turn and fold

TallyUI demo `/ui/accordion` (apps/demo), Playwright Chromium, 1280x800, JPEG quality 70, each shot taken 400ms
after the click so the turn and fold have ended.

- `tallyui-accordion-closed-light.jpg`, `tallyui-accordion-closed-dark.jpg`: "Single Collapsible", first item
  ("Is it accessible?") collapsed; its chevron points down.
- `tallyui-accordion-open-light.jpg`, `tallyui-accordion-open-dark.jpg`: the same item expanded again; its chevron
  is turned 180° and dimmed to 0.8.
- `tallyui-accordion-chevron-left-light.jpg`: the new "Chevron on the left" section (`chevronPosition="left"`,
  `headerClassName="flex-1"`), "First store" open.

Measured in the same run (light; dark within a few px): ~90ms into the close the chevron is turned ~113° and the
fold is 2.5px high; ~90ms into the open, ~49° and 30px of 33.6px; 400ms after each, the chevron is at
0° / 180° and the open fold is back to natural height (no inline height). No page errors.

## v2

Not reachable on the demo. v2's accordion is the sites list on the auth/connect screen
(WCPOS monorepo `packages/core/src/screens/auth/components/sites.tsx:116-170`, `chevronPosition="left"` and
`headerClassName="flex-1"` at :163-167). `https://demo.wcpos.com/pos` in a fresh context goes to the WordPress
sign-in page and then straight into the POS (product grid and "Which register is this device at?"); the web
build served from the store has no connect screen, so no sites list. No v2 shots were taken.
