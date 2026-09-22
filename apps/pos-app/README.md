# TallyUI POS app

The point-of-sale app, built only from TallyUI packages: a connector
(`@tallyui/connector-medusa` for now), `@tallyui/database` replication,
`@tallyui/pos` logic and `@tallyui/components`. The screen composes those
pieces. Swapping the connector is the only backend-specific line.

Current scope: a product lookup. All products are replicated into a local
RxDB database, listed with price and stock, and searchable by name, SKU or
barcode. There is no cart yet.

## Run it against the Medusa dev store

1. Start the store (see `dev/medusa-store/README.md`): `~/Projects/medusa-dev/scripts/restart.sh`.
2. `cp .env.example .env.local`, then set `EXPO_PUBLIC_MEDUSA_API_KEY` to the
   contents of `~/Projects/medusa-dev/.pos-api-key`.
3. `pnpm build` at the repo root once, then `pnpm --filter @tallyui/pos-app web`
   and open <http://localhost:8081>.

The API key is inlined into the web bundle, which is acceptable only for the
localhost dev store. A real register needs a user sign-in flow.
