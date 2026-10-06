import type { ProductSort } from './sort-products';

export type CatalogueView = 'grid' | 'table';
export type CatalogueGridColumns = 'auto' | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface CatalogueViewState {
  view: CatalogueView;
  gridColumns: CatalogueGridColumns;
  sort: ProductSort | null;
}
export const DEFAULT_CATALOGUE_VIEW_STATE: CatalogueViewState = Object.freeze({
  view: 'grid', gridColumns: 'auto', sort: null,
});

export type CatalogueViewAction =
  | { type: 'setView'; view: CatalogueView }
  | { type: 'setGridColumns'; gridColumns: CatalogueGridColumns }
  | { type: 'setSort'; sort: ProductSort | null }
  | { type: 'replace'; state: CatalogueViewState };

export function catalogueViewReducer(state: CatalogueViewState, action: CatalogueViewAction): CatalogueViewState {
  switch (action.type) {
    case 'setView': return state.view === action.view ? state : { ...state, view: action.view };
    case 'setGridColumns': return state.gridColumns === action.gridColumns ? state : { ...state, gridColumns: action.gridColumns };
    case 'setSort': return state.sort?.field === action.sort?.field && state.sort?.dir === action.sort?.dir
      ? state : { ...state, sort: action.sort };
    case 'replace': return action.state;
  }
}

export function normalizeCatalogueViewState(raw: unknown, defaults: CatalogueViewState = DEFAULT_CATALOGUE_VIEW_STATE): CatalogueViewState {
  if (typeof raw !== 'object' || raw === null) return defaults;
  try {
    const { view, gridColumns, sort } = raw as Record<string, unknown>;
    const candidate = sort as Partial<ProductSort> | null;
    return {
      view: view === 'grid' || view === 'table' ? view : defaults.view,
      gridColumns: gridColumns === 'auto' || (typeof gridColumns === 'number' && Number.isInteger(gridColumns)
        && gridColumns >= 2 && gridColumns <= 8) ? gridColumns as CatalogueGridColumns : defaults.gridColumns,
      sort: sort === null ? null : typeof candidate === 'object' && candidate
        && typeof candidate.field === 'string' && candidate.field.length > 0
        && (candidate.dir === 'asc' || candidate.dir === 'desc')
        ? { field: candidate.field, dir: candidate.dir } : defaults.sort,
    };
  } catch {
    return defaults;
  }
}

// Keep product names readable and touch targets at least 160 px wide where two columns fit.
const MIN_TILE_WIDTH = 160;
export function resolveGridColumns(gridColumns: CatalogueGridColumns, containerWidth: number): number {
  // ProductGrid has 4 px padding on each side of the content and each cell: 160 px tile + 8.
  return gridColumns === 'auto'
    ? Math.max(2, Math.min(6, Math.floor((containerWidth - 8) / (MIN_TILE_WIDTH + 8)))) : gridColumns;
}
