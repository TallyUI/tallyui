---
"@tallyui/core": minor
---

Core now describes a payment method in a backend-neutral way (`PaymentMethodDescriptor`), and a connector may list its methods with an optional `paymentMethods()`. A connector without it still offers cash and the card terminal, through `defaultPaymentMethods()` and `paymentMethodOf()`.
