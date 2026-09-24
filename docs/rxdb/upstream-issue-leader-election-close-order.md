# Draft upstream issue: closing a `multiInstance` database leaves an unhandled "Cannot post message after channel has closed"

> **Not pursued: single instance.** TallyUI databases are single-instance
> (ADR-061, 2026-09-24), following WCPOS v1.11.0, so this bug no longer
> affects us. This draft is kept as a record and **will not be posted**.

*Draft for Paul, 2026-09-24. **Not posted.** Filing it with RxDB is a
public post, so it goes out only on Paul's go-ahead. The text below is
written to be pasted into a new issue at
https://github.com/pubkey/rxdb/issues.*

TallyUI works around the bug in `createTallyDatabase` (`@tallyui/database`),
so nothing here blocks us.

---

**Title:** leader-election: `db.close()` on a `multiInstance` database
rejects unhandled, because `elector.die()` posts after the channel is
closed

**Versions:** `rxdb` 16.21.1, `broadcast-channel` 7.2.0 (the version RxDB
depends on). Node 24 and Chromium. Any storage with `multiInstance: true`.

**Describe the bug**

Closing a database that has `multiInstance: true` and the leader-election
plugin produces an unhandled promise rejection:

```
Error: BroadcastChannel.postMessage(): Cannot post message after channel has closed …
```

In the browser it shows up in the console on every sign-out, or on any
code path that closes and reopens the database. Under Vitest, the
unhandled rejection makes the run exit 1.

**Cause**

The close path runs in the wrong order:

1. `getForDatabase` (`plugins/leader-election/index.ts`) wraps
   `db.close()`:
   ```ts
   this.close = function () {
       removeBroadcastChannelReference(this.token, this);
       return oldClose();
   };
   ```
   `removeBroadcastChannelReference` (`rx-storage-multiinstance.ts`)
   drops the last reference and calls `state.bc.close()`. The shared
   channel is now closed.
2. `oldClose()` then runs the `preCloseRxDatabase` hooks. The
   leader-election plugin's hook, `onClose`, calls `has.die()` without
   awaiting or catching it.
3. `broadcast-channel`'s `LeaderElection.prototype.die()` always ends with
   `return sendLeaderMessage(this, 'death')`, whether or not this instance
   was the leader. The `postMessage` it makes throws on the closed channel.
   The rejected promise that `die()` returns isn't handled anywhere.

Calling `await db.leaderElector().die()` yourself before `db.close()`
doesn't help: `onClose` calls `die()` a second time, and that second
`death` post still goes to the closed channel.

**To reproduce**

```ts
const db = await createRxDatabase({ name: 'x', storage, multiInstance: true });
await db.waitForLeadership();
await db.close();
// → unhandled rejection: "Cannot post message after channel has closed"
```

It also reproduces without taking leadership, as long as
`db.leaderElector()` was called at some point.

**Expected behaviour**

`db.close()` resolves without unhandled rejections.

**Suggested fix**

Either change will do:
- Run the `preCloseRxDatabase` hooks, including `elector.die()`, **before**
  removing the broadcast-channel reference. For example, in the
  `getForDatabase` close wrapper, run `oldClose()` first and remove the
  reference afterwards, or have `onClose` await `die()` before the
  reference goes.
- Have `onClose` handle the `die()` promise: `has.die().catch(() => {})`,
  or ignore only the closed-channel error.

**Workaround we use**

On `multiInstance` databases, we wrap the elector's `die()` so that it
ignores only the closed-channel error:

```ts
const elector = db.leaderElector();
const die = elector.die.bind(elector);
elector.die = () => die().catch((error) => {
  if (isClosedChannelError(error)) return;
  throw error;
});
```
