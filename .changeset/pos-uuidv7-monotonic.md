---
"@tallyui/pos": patch
---

`uuidv7()` with no arguments is now monotonic: ids made in the same millisecond, or after the clock steps back, still sort strictly after the previous one (RFC 9562 monotonic random counter). Calls with an explicit timestamp or random source are unchanged.
