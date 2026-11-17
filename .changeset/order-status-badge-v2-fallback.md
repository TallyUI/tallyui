---
'@tallyui/components': minor
---

OrderStatusBadge follows WCPOS v2 on four points: `'refunded'` now uses the muted tone shared with `'cancelled'`; the muted tone's dot is `bg-muted-foreground` and its word stays in the foreground colour, so the Cancelled dot is visible; `'trash'` (Trash) and `'checkout-draft'` (Draft) join `OrderStatus`; and a status the badge does not know shows its raw string in the default (primary) tone instead of "Pending".
