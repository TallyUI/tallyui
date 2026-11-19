/**
 * The till's capability: the order.create versions `toOrderCreateEnvelope` can produce. It is not what a server
 * supports (#297). A server passes its own lists to `precheckCommand`, and its /info advertises them, gated by its
 * own check (Front desk, 2026-09-30): 4 (#286) is 3 with every discountMinor tax-exclusive, and a plugin
 * advertises it only once it handles it.
 * 5 (ADR-075) adds fees, shipping and custom lines; 6 (ADR-077) adds coupons, regular prices, line
 * attributes and Any picks (#495); a plugin advertises each only once it handles it.
 * 7 (ADR-083) adds the sale note; 8 (#722) adds `taxAddress` and the customer's addresses; 9 (#790) adds each coupon's per-line amounts.
 * 10 adds each payment's methodId (ruling A, 2026-11-18).
 * 11 is 10 plus the customer's billing and shipping on a sale not taxed by address (ADR-086 d2 as amended 2026-11-19).
 */
export const SUPPORTED_ORDER_CREATE_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
/** The till's capability for the contract versions shared by all five register commands; a server passes its own. */
export const SUPPORTED_REGISTER_VERSIONS: readonly number[] = [1]
/** The till's capability for order.refund versions (ADR-080); a server passes its own. */
export const SUPPORTED_ORDER_REFUND_VERSIONS: readonly number[] = [1]
/** The till's capability for order.reopen versions (ADR-090); a server passes its own. */
export const SUPPORTED_ORDER_REOPEN_VERSIONS: readonly number[] = [1]
/** The till's capability for order.update versions (ADR-090); a server passes its own. */
export const SUPPORTED_ORDER_UPDATE_VERSIONS: readonly number[] = [1]
