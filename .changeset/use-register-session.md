---
'@tallyui/pos': minor
---

Add `useRegisterSession`, the till's register session as React state with its actions (open, count, back to selling, close, cash movements, voids). The app supplies every input. Expected cash and the sales count are derived locally from `pos_orders`, and nothing is sent to a server. `requireOpen()` gates tender. `RegisterTenderInProgressError` stops counting or closing during a sale at tender, `RegisterSessionAlreadyOpenError` stops a second open, and `RegisterCloseIncompleteError` stops an open until an interrupted close is finished. A resumed close uses the count saved on the session.
