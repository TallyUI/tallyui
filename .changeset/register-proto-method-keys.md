---
'@tallyui/pos': patch
---

Register figures and closures keep a payment method id named like an Object.prototype member (`__proto__`, `constructor`) as an ordinary key, instead of dropping it or writing to Object.prototype.
