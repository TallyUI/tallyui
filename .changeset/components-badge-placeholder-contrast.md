---
"@tallyui/components": patch
---

Status badges use foreground text on their tint (the dot carries the colour), since coloured text on a 15% tint of itself fails WCAG AA; the refunded order badge uses the destructive token instead of the undefined `danger`. Search, cart-note and customer inputs take their placeholder colour from the `muted-foreground` token.
