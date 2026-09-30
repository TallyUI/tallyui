/**
 * The till's capability: the order.create versions `toOrderCreateEnvelope` can produce. It is not what a server
 * supports (#297). A server passes its own lists to `precheckCommand`, and its /info advertises them, gated by its
 * own check (Front desk, 2026-09-30): 4 (#286) is 3 with every discountMinor tax-exclusive, and a plugin
 * advertises it only once it handles it.
 */
export const SUPPORTED_ORDER_CREATE_VERSIONS: readonly number[] = [1, 2, 3, 4]
/** The till's capability for the contract versions shared by all five register commands; a server passes its own. */
export const SUPPORTED_REGISTER_VERSIONS: readonly number[] = [1]
