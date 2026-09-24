const INTEGER_STRING = /^\d+$/;

/** Orders backend ids: numerically when both are integer strings (Vendure '9' < '10', compared with BigInt so long ids stay exact), with ties in numeric value (e.g. '01' vs '1') broken by plain string order; an integer id always sorts before a non-integer one; otherwise (neither is an integer string) by plain string order (not `localeCompare`, which is locale-dependent). This is a total order, so sorting is consistent regardless of input order. */
export function compareIds(a: string | number, b: string | number): number {
  const sa = String(a);
  const sb = String(b);
  const aNum = INTEGER_STRING.test(sa);
  const bNum = INTEGER_STRING.test(sb);
  if (aNum && bNum) {
    const diff = BigInt(sa) - BigInt(sb);
    if (diff !== 0n) return diff < 0n ? -1 : 1;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  if (aNum !== bNum) return aNum ? -1 : 1;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
