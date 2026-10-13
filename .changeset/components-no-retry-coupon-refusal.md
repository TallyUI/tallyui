---
"@tallyui/components": patch
---

Needs attention offers no Retry for a `coupon_invalid` or `total_mismatch` refusal, which the outbox does not resend (#501, ADR-077 Q-d4b-4).
