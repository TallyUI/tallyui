/**
 * Cash denominations by face value, in integer minor units, largest first (ADR-032 amendment 1:
 * WCPOS `next` `3b5331b5c`). Every list, `default` included, assumes a two-decimal currency.
 */
const coinsMinor = [200, 100, 50, 20, 10, 5, 2, 1];
export const denominations: Record<string, number[]> = {
  GBP: [5000, 2000, 1000, 500, ...coinsMinor],
  EUR: [50000, 20000, 10000, 5000, 2000, 1000, 500, ...coinsMinor],
  USD: [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1],
  default: [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1],
};
