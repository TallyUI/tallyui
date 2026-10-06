import type { ProductCategory, ProductTraits } from '@tallyui/core';

/** The product's categories: `getCategories`, else `getCategoryNames` with each name as its id. */
export function productCategories<Doc>(doc: Doc, traits: ProductTraits<Doc>): ProductCategory[] {
  return traits.getCategories
    ? traits.getCategories(doc)
    : traits.getCategoryNames(doc).map((name) => ({ id: name, name }));
}

/** Every category across `docs`, once per id (the first name seen wins), sorted by name (natural, case-insensitive), ties by id. */
export function listCategories<Doc>(docs: readonly Doc[], traits: ProductTraits<Doc>): ProductCategory[] {
  const categories = new Map<string, ProductCategory>();
  for (const doc of docs) {
    for (const category of productCategories(doc, traits)) {
      if (!categories.has(category.id)) categories.set(category.id, category);
    }
  }
  return [...categories.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Whether `doc` is in the category with this id. */
export function inCategory<Doc>(doc: Doc, categoryId: string, traits: ProductTraits<Doc>): boolean {
  return productCategories(doc, traits).some((category) => category.id === categoryId);
}
