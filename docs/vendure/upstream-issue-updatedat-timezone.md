# Draft upstream issue: `updatedAt` list filters are skewed by the server's UTC offset

*Draft for Paul, 2026-09-24. **Not posted.** Filing it with Vendure is a
public post, so it goes out only on Paul's go-ahead (ADR-060). The text
below is written to be pasted into a new issue at
https://github.com/vendurehq/vendure/issues.*

---

**Title:** DateOperators filters on `updatedAt`/`createdAt` are shifted by
the server's UTC offset on Postgres

**Vendure version:** 3.7.3 (`@vendure/core`). Postgres 17, `pg` 8.x,
Node 24. The scaffold config was used, except that the store runs in a
non-UTC time zone.

**Describe the bug**

On a server whose Node process runs in a time zone other than UTC, list
filters on `DateTime` fields compare against the wrong instant. The
`updatedAt`/`createdAt` columns are `timestamp without time zone` and hold
the server's local wall time. The filter value arrives as an ISO 8601 UTC
string, and Postgres ignores the zone designator when it compares a literal
with a `timestamp without time zone` column. The API's *output* is
converted correctly, so a client that filters on a timestamp the API
itself returned gets the wrong rows:
- **East of UTC**, `after` returns rows it should not, which over-fetches.
- **West of UTC**, `after` silently **omits** the most recent changes, up
  to the offset in hours. Incremental sync clients lose updates.

**To reproduce**

1. Run Vendure 3.7.3 on Postgres with the Node process and the database
   session in, for example, `Europe/Madrid` (UTC+2).
2. Seed a few products.
3. Query the newest product:
   `products(options: { take: 1, sort: { updatedAt: DESC } }) { items { updatedAt } }`.
   Call the result `T`.
4. Query
   `products(options: { take: 1, filter: { updatedAt: { after: T } } }) { totalItems }`.

**Expected:** `totalItems` is 0, or 1 if the stored value has sub-millisecond
precision past `T`.

**Actual:** at UTC+2, `totalItems` is the whole catalogue. We measured
2,000 of 2,000. The filter behaves as if the cut-off were `T − 2h`. At a
negative offset, the newest rows are excluded instead.

**Workaround:** run both the Node process (`TZ=UTC`) and the database
session (`TimeZone=UTC`) in UTC. Running only the process in UTC makes it
worse: `now()` column defaults are then stored in the session's local time
and read back as UTC, so timestamps come out hours in the future.

**Suggested fix (for discussion):** either use `timestamptz` columns for
the entity timestamps, or convert `DateOperators` filter values into the
server's local wall time before building the query, the same conversion
used when reading the columns.

**Also noticed, possibly related:** timestamps are stored with microsecond
precision but returned with milliseconds, so
`after: <a returned timestamp>` matches the row itself. Clients have to
allow ±1 ms. This may be intended; mentioned for completeness.
