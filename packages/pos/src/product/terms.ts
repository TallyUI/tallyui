import type { ProductTerm, ProductTraits } from '@tallyui/core';

/** One term group across a set of products, e.g. Brand with its terms. */
export interface ProductTermGroup {
  id: string;
  name: string;
  terms: { id: string; name: string }[];
}

/** By name (natural, case-insensitive), ties by id: the same order as `listCategories`. */
function byName(a: { id: string; name: string }, b: { id: string; name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The product's terms: `getTerms`, else none. */
export function productTerms<Doc>(doc: Doc, traits: ProductTraits<Doc>): ProductTerm[] {
  return traits.getTerms?.(doc) ?? [];
}

/** Every term group across `docs`, once per group id and each term once per id (the first name seen wins), groups and terms sorted by name. */
export function listTermGroups<Doc>(docs: readonly Doc[], traits: ProductTraits<Doc>): ProductTermGroup[] {
  const groups = new Map<string, { id: string; name: string; terms: Map<string, { id: string; name: string }> }>();
  for (const doc of docs) {
    for (const term of productTerms(doc, traits)) {
      let group = groups.get(term.group);
      if (!group) {
        group = { id: term.group, name: term.groupName, terms: new Map() };
        groups.set(term.group, group);
      }
      if (!group.terms.has(term.id)) group.terms.set(term.id, { id: term.id, name: term.name });
    }
  }
  return [...groups.values()]
    .map(({ id, name, terms }) => ({ id, name, terms: [...terms.values()].sort(byName) }))
    .sort(byName);
}

/** Whether `doc` carries the term with this id in this group. */
export function hasTerm<Doc>(doc: Doc, group: string, termId: string, traits: ProductTraits<Doc>): boolean {
  return productTerms(doc, traits).some((term) => term.group === group && term.id === termId);
}
