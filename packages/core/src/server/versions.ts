// The order.create versions core knows, which the batch pre-check (precheckCommand) enforces. A plugin's /info
// advertises its own list, gated by its own check (Front desk, 2026-09-30): 4 (#286) is 3 with every
// discountMinor tax-exclusive, and a plugin advertises it only once it handles it.
export const SUPPORTED_ORDER_CREATE_VERSIONS: readonly number[] = [1, 2, 3, 4]
// The contract versions shared by all five register commands.
export const SUPPORTED_REGISTER_VERSIONS: readonly number[] = [1]
