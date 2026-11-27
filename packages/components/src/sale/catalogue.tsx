import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { cn } from '@tallyui/theme';
import { resolvePrice, useProductStock, useStockOverlaid, useStockOverlayAsOf, type ProductTraits, type ProductCategory, type VariantSummary } from '@tallyui/core';
import { catalogueEntries, findEntryByCode, searchProducts, variantPriceLabel, sortProducts, productSortValue,
  catalogueViewReducer, normalizeCatalogueViewState, resolveGridColumns, DEFAULT_CATALOGUE_VIEW_STATE,
  listCategories, inCategory, productCategories, cartQuantities, listTermGroups, hasTerm, DEFAULT_TILE_FIELDS,
  type TileFields, type CatalogueEntry, type CatalogueViewState, type CatalogueViewAction, type CartQuantityLine } from '@tallyui/pos';
import { ProductGrid, ProductImage, ProductPrice, ProductStockBadge, ProductTitle, ProductTable, ViewToggle, CategoryNav } from '../product';
import { ProductVariantPicker } from '../product/product-variant-picker';
import { STOCK_STATUS_LABELS } from '../product/product-stock-badge';
import { VariationPicker } from '../product/variation-picker';
import { InCartBadge } from '../product/in-cart-badge';
import { PressVeil } from '../product/press-veil';
import { VariantParentTile, VariantTile } from '../product/variant-tile';
import { Popover } from '@tallyui/primitives';
import { CameraScanButton } from '../product/camera-scan-button';
import { CameraScannerPanel, type CameraScannerPanelProps } from '../product/camera-scanner-panel';
import { ProductFilterBar, DEFAULT_PRODUCT_FILTERS, type ProductFilterChip, type ProductFilters } from './product-filter-bar';
import { CategoryBrowseGrid } from './category-browse';
import { DealCell, DealStage } from './category-deal';
import { Breadcrumb } from './breadcrumb';
import { CategoryTile, TileStack } from '../product/category-tile';
import { useT } from '../i18n';
import { SearchInput } from '../input';
import { VStack, IconButton, PlusIcon, ChevronDownIcon, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui';
import { skeletonCount } from '../ui/skeleton';
import { useMinTarget } from '../scale/min-target';
import { usePointer } from '../scale/use-pointer';

// ProductTable's add column (product-table.tsx ACTION_WIDTH), so a variant row's + sits under its parent row's +.
const VARIANT_ADD_WIDTH = 56;

// Below either number the window is a phone (v2 packages/components/src/lib/device.ts:15-24), and the search
// field is not capped: v2 caps it only at wide widths (packages/components/src/page-bar/index.tsx:138-139).
const WIDE_MIN_WIDTH = 768;
const WIDE_MIN_HEIGHT = 480;
// A loading tile in the grid tile's frame (the tile below, as ProductCard): its 80 px image, then the band under it,
// one gap-2 (8) above each row the tile draws for its fields. Title, price and stock badge with their gaps were 75 px
// at the regular scale, measured in the demo (a tile with no image is 101 px: 75 + p-3 + border). The title and price
// rows are text-sm's 20 px line, and the badge's 19 is what is left of the measured 75. A fact row (SKU, barcode,
// categories) is text-xs's 16 px line, from the type scale, not measured.
const TILE_IMAGE = 80;
const TILE_GAP = 8;
const TILE_ROW_HEIGHTS: [keyof TileFields, number][] = [['name', 20], ['price', 20], ['sku', 16], ['barcode', 16], ['categories', 16], ['stock', 19]];
function tileBand(fields: TileFields): number {
  return TILE_ROW_HEIGHTS.reduce((band, [field, height]) => band + (fields[field] ? TILE_GAP + height : 0), 0);
}
// One grid row: the tile's p-3 and border (12 + 1 each side) and the grid cell's p-1 (4 each side) around image and band.
// TallyUI difference: v2 counts rows at the tile's width plus its band, as its poster image is the tile's width; here the
// image is a fixed 80 px, so the row is a fixed height.
const tileRow = (fields: TileFields) => TILE_IMAGE + tileBand(fields) + 2 * (12 + 1 + 4);
// A level's first grid slot, its own category as a back poster (v2 browse/term-grid.tsx:271-272), as the drill's parent.
const LEVEL_PARENT = { id: 'level-parent' };

// locale/hour12/now are injected (rather than read from the device or the clock inside this
// function) so the formatting is testable without the device; callers default them to the
// device's own settings and the current moment.
export function formatStockSyncTime(time: Date, locale?: string, hour12?: boolean, now: Date = new Date()): string {
  const timeLabel = time.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12 });
  // "Today" is decided in the device's own timezone: toDateString() reads the Date in local time,
  // the same timezone the device clock and toLocaleTimeString above already use.
  if (time.toDateString() === now.toDateString()) return timeLabel;
  const dateLabel = time.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${dateLabel}, ${timeLabel}`;
}

// The later of a session's own catalogue sync and a persisted stock check from a previous session
// (or restart), so an old persisted time never shadows a fresher sync.
function laterOf(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function isOnSale<Doc>(doc: Doc, traits: ProductTraits<Doc>, currency: string): boolean {
  if (resolvePrice(traits.getPrices(doc, { currency }), currency)?.was) return true;
  return traits.getVariants?.(doc, { currency }).some((variant) => !!resolvePrice(variant.prices, currency)?.was) ?? false;
}

// Only when React would draw it: `!open && <Notice />` passes false, which must not leave a blank band.
function draws(node: ReactNode): boolean {
  return node != null && typeof node !== 'boolean' && node !== '';
}

export function Catalogue<Doc>({ products, traits, currency, onSelect, statusText, statusAccessory, searchAccessory, lastSyncedAt, loading, pullError, lastStockCheckAt, hour12, minCodeLength,
  viewState, defaultViewState, loadViewState, saveViewState, onViewStateError, onStateChange, showViewToggle = false, items, onQueryChange, showCategoryNav = false, categoryBrowse = 'chips', categories, pickAnyOptions = false,
  cartLines, showFilterBar = false, filterChips = ['inStock'], inStockKeepsBackorder = false, termPills = false, termPicks: termPicksProp, onTermPicksChange,
  filters: filtersProp, onFiltersChange, variationsStyle = 'list', cameraScan = false, cameraScanner, tableRow, rowsSlot, tileFields }: {
  products: Doc[];
  traits: ProductTraits<Doc>;
  currency: string;
  /** Receives the chosen product and variant with the nearest ConnectorProvider's stock overlay applied (a copy). */
  onSelect: (entry: CatalogueEntry<Doc>) => void;
  statusText?: string;
  /** Rendered at the end of the status line, e.g. a register control at phone width; the row renders even without `statusText`. */
  statusAccessory?: ReactNode;
  /** v2's own controls beside the search field (its PageBar children, e.g. the Product settings button): rendered
   * at the end of the search row, after the camera scan button and the view toggle. Default none. */
  searchAccessory?: ReactNode;
  lastSyncedAt: Date | null;
  /** The catalogue's first pull is still running, so an empty grid says "Loading products…" rather than "No products yet.". Defaults to lastSyncedAt === null with no pullError; pass false
   * when a null lastSyncedAt doesn't mean a pull is running (e.g. offline on first start). */
  loading?: boolean;
  /** The product pull's last error (an Error, a SyncNotice, anything the app holds), or null/undefined when none. While it is
   * set, a catalogue that has never synced isn't treated as loading, so its empty grid says "No products yet." beside the app's error. */
  pullError?: unknown;
  /** The last completed stock reconcile pass, persisted across restarts. The "stock as of" time shown is the
   * latest of this, the provider's stockOverlayAsOf (when valid) and lastSyncedAt; null and omitted alike. */
  lastStockCheckAt?: Date | null;
  /** Whether to show a 12- or 24-hour clock in the stock-as-of time; undefined keeps the locale default. A platform
   * reads this off its own device APIs (e.g. expo-localization's getCalendars()) and passes it in. */
  hour12?: boolean;
  /** A till's scanner setting: below this length (after trimming), Enter leaves the typed text as a plain
   * search instead of doing a code lookup. A scanner's timing threshold is the app's own concern,
   * in its unfocused wedge listener — not this prop's job. */
  minCodeLength?: number;
  /** Controlled view state; changes are reported through onStateChange. */
  viewState?: CatalogueViewState;
  /** Uncontrolled initial state, merged over DEFAULT_CATALOGUE_VIEW_STATE. */
  defaultViewState?: Partial<CatalogueViewState>;
  /** App-owned stored state, read once on mount in uncontrolled mode. */
  loadViewState?: () => unknown | Promise<unknown>;
  /** Saves cashier changes, never loads; uncontrolled only. */
  saveViewState?: (state: CatalogueViewState) => void | Promise<void>;
  /** Load/save errors; swallowed when omitted. */
  onViewStateError?: (error: unknown) => void;
  /** Loaded state or a cashier's next state (requested state when controlled). */
  onStateChange?: (state: CatalogueViewState) => void;
  /** Show v2's single view-mode icon button (grid/table) in the search row, beside the search field as in v2. Default false. */
  showViewToggle?: boolean;
  /** Show the category nav in the header. Default false. */
  showCategoryNav?: boolean;
  /** How the categories show when showCategoryNav is set: 'chips' (default) is the CategoryNav row; 'tiles' is v2's
   * browse root, the categories as poster tiles with their product counts, opening one under a "Categories › name"
   * breadcrumb. A search typed at the root searches every product. */
  categoryBrowse?: 'chips' | 'tiles';
  /** Replaces the categories derived from the listed products. */
  categories?: ProductCategory[];
  /** App-filtered, sorted list shown as given; products still drives scanning and variant choices. */
  items?: Doc[];
  /** Search text on every input change, and `''` when Enter selects a matching code, for apps that filter items themselves. */
  onQueryChange?: (query: string) => void;
  /** Ask for a value for each of a variant's local "Any" option groups before onSelect (#495); set it only when the store accepts order.create version 6. */
  pickAnyOptions?: boolean;
  /** The open sale's lines (e.g. useSale's order.lineItems); each grid tile shows its product's summed quantity.
   * A line's optional `variantId`, which a sale line has, lets the drill count each variant. */
  cartLines?: readonly (CartQuantityLine & { variantId?: string })[];
  /** Show v2's filter chips under the search box. Default false. */
  showFilterBar?: boolean;
  /** Which chips the bar shows. Default ['inStock']; Catalogue applies In Stock, Featured and On Sale itself.
   * The Featured chip is drawn only when the connector's traits have getFeatured. */
  filterChips?: readonly ProductFilterChip[];
  /** With the In Stock pill on, keep 'backorder' products in the grid (only 'out_of_stock' is dropped). Default false: WCPOS v2's pill is stock_status 'instock' and drops backorders too. */
  inStockKeepsBackorder?: boolean;
  /** With showFilterBar, a term pill per term group (traits.getTerms) after the chips: `true` for every group the listed
   *  products carry, in listTermGroups order, or the group ids to show, in this order (a group with no terms is not drawn).
   *  Single select per group; groups AND together. With `items`, drawn only when onTermPicksChange is passed. Default off. */
  termPills?: boolean | readonly string[];
  /** Controlled term pill picks (term group id to term id); changes are reported through onTermPicksChange. */
  termPicks?: Readonly<Record<string, string>>;
  /** The cashier's next term picks (requested picks when controlled). With `items`, the pills are drawn only when this is
   *  passed, and the app applies the picks to its own list. Apply only picks whose term `listTermGroups(products, traits)`
   *  still holds; Catalogue keeps a vanished term's pick but does not apply it. */
  onTermPicksChange?: (picks: Readonly<Record<string, string>>) => void;
  /** Controlled filters; changes are reported through onFiltersChange. */
  filters?: ProductFilters;
  /** The cashier's next filters (requested filters when controlled). */
  onFiltersChange?: (filters: ProductFilters) => void;
  /** v2's Product settings › Variations. 'list' (default) opens the variant list chooser; 'popover' opens a grid tile's
   * VariationPicker in a popover for a product with option groups; 'drill' swaps the grid for the product's variant
   * tiles, with the product's tile first as Back, as v2's "Open in place". The table view keeps the list chooser. */
  variationsStyle?: 'list' | 'popover' | 'drill';
  /** Show v2's camera scan button beside the search box; it opens an inline CameraScannerPanel. Default false.
   * The button shows only when cameraScanner is passed too. */
  cameraScan?: boolean;
  /** Passed to the CameraScannerPanel. The app owns useCameraScan (inside its ScanHubProvider) and passes its wiring
   * here, { onDetected: camera.offer, onOpen: camera.reset, scanCount: camera.scanCount }, plus height, permission,
   * viewfinder, decoder and readiness; its useBarcodeScanner then handles camera scans like device scans. */
  cameraScanner?: Omit<CameraScannerPanelProps, 'onClose'>;
  /** v2's table row extras in table view: thumbnail leads the row, addButton ends it with the + (> for a product
   * with variants) that does what a row press does. With expand and thumbnail, a product with more than one variant
   * has its thumbnail show or hide its variants as rows under it: option chips, price, stock and a + that adds that
   * variant as the list chooser does; variationsButton adds v2's '{count} variations' button under the name, which shows
   * or hides the variants as expand does; it needs expand. Default: none. */
  tableRow?: { thumbnail?: boolean; addButton?: boolean; expand?: boolean; variationsButton?: boolean };
  /** v2's rows between the chips and the products (its ListColumn `rows`): notices such as "Price check only until
   * the register is open.", rendered under the header and above the grid, table or category tiles. Default none. */
  rowsSlot?: ReactNode;
  /** v2's Product settings › Tile Fields: which words a grid tile shows. Merged over DEFAULT_TILE_FIELDS (today's tile:
   * name, price with its on-sale strike, stock status). Apps feed it from the `catalogue.tileFields` app setting. The grid
   * tiles, the drill's variant tiles and the loading skeleton follow it; the table does not. */
  tileFields?: Partial<TileFields>;
}) {
  const [initial] = useState<{
    state: CatalogueViewState; loaded?: CatalogueViewState; pending?: Promise<unknown>; failed?: boolean; error?: unknown;
  }>(() => {
    const state = normalizeCatalogueViewState({ ...DEFAULT_CATALOGUE_VIEW_STATE, ...defaultViewState });
    if (viewState !== undefined || !loadViewState) return { state };
    try {
      const value = loadViewState();
      if (value instanceof Promise) return { state, pending: value };
      const loaded = normalizeCatalogueViewState(value, state);
      return { state: loaded, loaded };
    } catch (error) {
      return { state, failed: true, error };
    }
  });
  const [internalState, setInternalState] = useState(initial.state);
  const state = viewState ?? internalState;
  const fields: TileFields = { ...DEFAULT_TILE_FIELDS, ...tileFields };
  const cashierChanged = useRef(false);
  useEffect(() => {
    let mounted = true;
    if (initial.loaded) onStateChange?.(initial.loaded);
    if (initial.failed) onViewStateError?.(initial.error);
    initial.pending?.then((value) => {
      if (!mounted || cashierChanged.current) return;
      const loaded = normalizeCatalogueViewState(value, initial.state);
      setInternalState(loaded);
      onStateChange?.(loaded);
    }, (error) => { if (mounted) onViewStateError?.(error); });
    return () => { mounted = false; };
  }, [initial]);

  function changeState(action: CatalogueViewAction) {
    const next = catalogueViewReducer(state, action);
    if (next === state) return;
    cashierChanged.current = true;
    if (viewState !== undefined) { onStateChange?.(next); return; }
    setInternalState(next);
    onStateChange?.(next);
    try {
      Promise.resolve(saveViewState?.(next)).catch((error) => onViewStateError?.(error));
    } catch (error) {
      onViewStateError?.(error);
    }
  }

  const [internalFilters, setInternalFilters] = useState(DEFAULT_PRODUCT_FILTERS);
  const filters = filtersProp ?? internalFilters;
  function changeFilters(next: ProductFilters) {
    if (filtersProp === undefined) setInternalFilters(next);
    onFiltersChange?.(next);
  }
  const quantities = useMemo(() => cartQuantities(cartLines ?? []), [cartLines]);
  // The drill's per-variant count, by cartQuantities' rule: a custom line counts for no variant.
  const variantQuantities = useMemo(() => {
    const byVariant = new Map<string, number>();
    for (const line of cartLines ?? []) if (!line.custom && line.variantId) byVariant.set(line.variantId, (byVariant.get(line.variantId) ?? 0) + line.quantity);
    return byVariant;
  }, [cartLines]);

  const isLoading = loading ?? (lastSyncedAt === null && pullError == null);
  // Idempotent (the adapter's overlay returns just the fields the stock map sets), so an app that already
  // merges the overlay itself keeps working, and can drop its own merge.
  const shown = useStockOverlaid(products) as Doc[];
  const categoryList = useMemo(() => categories ?? listCategories(shown, traits), [categories, shown, traits]);
  const counts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of shown) {
      for (const id of new Set(productCategories(doc, traits).map((category) => category.id))) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [shown, traits]);
  const activeCategory = showCategoryNav ? categoryList.find((category) => category.id === state.categoryId) : undefined;
  const suppliedItems = useStockOverlaid(items ?? products) as Doc[];
  const overlayAsOf = useStockOverlayAsOf();
  const parsedOverlayAsOf = overlayAsOf ? new Date(overlayAsOf) : undefined;
  const validOverlayAsOf = parsedOverlayAsOf && !isNaN(parsedOverlayAsOf.getTime()) ? parsedOverlayAsOf : undefined;
  const stockAsOf = laterOf(laterOf(lastStockCheckAt, validOverlayAsOf), lastSyncedAt);
  const t = useT();
  const [query, setQuery] = useState('');
  const [allOpen, setAllOpen] = useState(false);
  // Opening a category by its tile focuses the crumb (v2 focuses on mount); a stored category does not.
  const [crumbFocus, setCrumbFocus] = useState(false);
  const browsing = showCategoryNav && categoryBrowse === 'tiles';
  const level = browsing && (activeCategory || allOpen);
  const back = () => { setCrumbFocus(false); setAllOpen(false); changeState({ type: 'setCategory', categoryId: null }); };
  const atRoot = browsing && !activeCategory && !allOpen && !query.trim()
    && categoryList.some((category) => (counts.get(category.id) ?? 0) > 0);
  const [scannerOpen, setScannerOpen] = useState(false);
  // The search row is shorter than a control's band at Compact: under a coarse pointer it is the band's height.
  const band = useMinTarget();
  const coarse = usePointer() === 'coarse';
  const window = useWindowDimensions();
  const phone = window.width < WIDE_MIN_WIDTH || window.height < WIDE_MIN_HEIGHT;
  // The chooser is live (medusapos ADR 0007): it holds only the chosen product's id and derives its choices
  // from the current entries below, so an open chooser shows each reconcile pass as it lands.
  const [chooserId, setChooserId] = useState<string | null>(null);
  // The product ids whose table rows are expanded (local, never saved).
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  // An expanded row's option filters (product id to group name to value), dropped when the row collapses.
  const [variantFilters, setVariantFilters] = useState<Readonly<Record<string, Readonly<Record<string, string>>>>>({});
  function toggleExpanded(key: string) {
    const open = !expandedIds.has(key);
    setExpandedIds((current) => {
      const next = new Set(current);
      if (open) next.add(key); else next.delete(key);
      return next;
    });
    if (!open) setVariantFilters((current) => { const next = { ...current }; delete next[key]; return next; });
  }
  const [width, setWidth] = useState(0);
  const [loadingHeight, setLoadingHeight] = useState(0);
  const columns = resolveGridColumns(state.gridColumns, width);
  const entries = useMemo(() => catalogueEntries(shown, traits, { currency }), [shown, traits, currency]);
  // Entries per product id: the drill stacks a tile that selectProduct would drill into (v2 product-tile.tsx:54,76).
  const entryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(traits.getId(entry.product), (counts.get(traits.getId(entry.product)) ?? 0) + 1);
    return counts;
  }, [entries, traits]);
  // v2's In Stock pill drops backorders unless inStockKeepsBackorder is set; a stock the backend did not report stays.
  const stockFiltered = showFilterBar && filters.inStock;
  const saleFiltered = showFilterBar && filters.onSale;
  const featuredFiltered = showFilterBar && filters.featured && traits.getFeatured !== undefined;
  // Term picks are local unless controlled and reported through onTermPicksChange. A pick is kept but not applied
  // while no drawn group holds its term.
  const [internalTermPicks, setInternalTermPicks] = useState<Readonly<Record<string, string>>>({});
  const termPicks = termPicksProp ?? internalTermPicks;
  const reportsTermPicks = onTermPicksChange !== undefined;
  const allTermGroups = useMemo(() => (showFilterBar && termPills && (items === undefined || reportsTermPicks) ? listTermGroups(shown, traits) : []),
    [showFilterBar, termPills, items, reportsTermPicks, shown, traits]);
  const termGroups = useMemo(() => (termPills === true ? allTermGroups
    : termPills ? termPills.flatMap((id) => allTermGroups.filter((group) => group.id === id)) : []), [allTermGroups, termPills]);
  const activeTerms = useMemo(() => termGroups
    .filter((group) => group.terms.some((term) => term.id === termPicks[group.id]))
    .map((group) => [group.id, termPicks[group.id]] as const), [termGroups, termPicks]);
  function pickTerm(group: string, term: string | undefined) {
    const next = { ...termPicks };
    if (term === undefined) delete next[group]; else next[group] = term;
    if (termPicksProp === undefined) setInternalTermPicks(next);
    onTermPicksChange?.(next);
  }
  const results = useMemo(() => {
    if (items !== undefined) return suppliedItems;
    const matched = searchProducts(activeCategory
      ? shown.filter((doc) => inCategory(doc, activeCategory.id, traits)) : shown, query, traits);
    const stocked = stockFiltered
      ? matched.filter((doc) => !(inStockKeepsBackorder ? ['out_of_stock'] : ['out_of_stock', 'backorder']).includes(traits.getStock(doc).status)) : matched;
    const priced = saleFiltered ? stocked.filter((doc) => isOnSale(doc, traits, currency)) : stocked;
    const getFeatured = traits.getFeatured;
    const featured = featuredFiltered && getFeatured ? priced.filter((doc) => getFeatured(doc)) : priced;
    const filtered = activeTerms.length > 0
      ? featured.filter((doc) => activeTerms.every(([group, term]) => hasTerm(doc, group, term, traits))) : featured;
    return state.sort ? sortProducts(filtered, state.sort, (doc, field) => productSortValue(doc, field, traits, { currency })) : filtered;
  }, [items, suppliedItems, shown, query, traits, state.sort, currency, showCategoryNav, activeCategory, stockFiltered, inStockKeepsBackorder, saleFiltered, featuredFiltered, activeTerms]);
  const choices = useMemo(() => (chooserId === null ? []
    : entries.filter((entry) => traits.getId(entry.product) === chooserId)), [entries, chooserId, traits]);
  // A product that leaves the catalogue (a resync, or no longer sellable) closes its chooser.
  useEffect(() => { if (chooserId !== null && choices.length === 0) setChooserId(null); }, [chooserId, choices]);
  // The drill ('drill' style, grid view) is live like the chooser: the product's id, its tiles from the current entries.
  const [drillId, setDrillId] = useState<string | null>(null);
  const drillEntries = useMemo(() => (drillId === null ? []
    : entries.filter((entry) => traits.getId(entry.product) === drillId)), [entries, drillId, traits]);
  // A product that leaves the catalogue leaves its drill; so do a new search, a category change and the table view.
  useEffect(() => { if (drillId !== null && drillEntries.length === 0) setDrillId(null); }, [drillId, drillEntries]);
  useEffect(() => { setDrillId(null); }, [query, activeCategory?.id, state.view]);
  // The variant's option values in the product's group order, then any other options; the title when it has none.
  function chipsOf(entry: CatalogueEntry<Doc>) {
    const options = entry.variant.options ?? {};
    const names = (traits.getVariantOptions?.(entry.product) ?? []).map(({ name }) => name)
      .filter((name) => Object.prototype.hasOwnProperty.call(options, name));
    const chips = [...names, ...Object.keys(options).filter((name) => !names.includes(name))].map((name) => options[name]);
    return chips.length > 0 ? chips : [entry.variant.title ?? traits.getName(entry.product)];
  }

  // The picker step (#495): the entry waiting for its "Any" picks, and the cashier's picks so far.
  const [pickEntry, setPickEntry] = useState<CatalogueEntry<Doc> | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  // A variant's local "Any" groups: no backend id (global pa_* attributes are #572), no fixed value on the variant.
  function anyGroupsOf(entry: CatalogueEntry<Doc>) {
    const fixed = entry.variant.options ?? {};
    return (traits.getVariantOptions?.(entry.product) ?? []).filter(({ id, name, values }) =>
      id === undefined && !Object.prototype.hasOwnProperty.call(fixed, name) && values.length > 0);
  }
  const anyGroups = pickEntry ? anyGroupsOf(pickEntry) : [];
  const allPicked = anyGroups.every(({ name }) => picks[name]);

  function closePicker() {
    setPickEntry(null);
    setPicks({});
  }
  // An entry that leaves the catalogue (a resync, or no longer sellable) closes its picker.
  useEffect(() => {
    if (pickEntry && !entries.some((entry) => traits.getId(entry.product) === traits.getId(pickEntry.product)
      && entry.variant.id === pickEntry.variant.id)) closePicker();
  }, [pickEntry, entries, traits]);

  function select(entry: CatalogueEntry<Doc>) {
    const picking = pickAnyOptions && anyGroupsOf(entry).length > 0;
    closePicker();
    if (picking) setPickEntry(entry);
    else onSelect(entry);
    setChooserId(null);
  }

  function selectProduct(product: Doc) {
    const variants = entries.filter((entry) => traits.getId(entry.product) === traits.getId(product));
    if (variants.length === 1) select(variants[0]);
    else if (variationsStyle === 'drill' && state.view !== 'table' && variants.length > 1) {
      closePicker(); setChooserId(null); setDrillId(traits.getId(product));
    } else { closePicker(); setChooserId(traits.getId(product)); }
  }

  function variantRows(product: Doc) {
    const id = traits.getId(product);
    const variants = entries.filter((entry) => traits.getId(entry.product) === id);
    if (variants.length === 0) return <Text className="px-3 py-1.5 text-sm text-muted-foreground">No variants to show.</Text>;
    const picked = variantFilters[id] ?? {};
    const groups = (traits.getVariantOptions?.(product) ?? []).filter(({ values }) => values.length > 1);
    // A variant leaving a group unset fits any value of it; a picked group that draws no select no longer filters.
    const matching = variants.filter(({ variant: { options } }) => groups.every(({ name }) => !picked[name]
      || options === undefined || !Object.prototype.hasOwnProperty.call(options, name) || options[name] === picked[name]));
    const pick = (group: string, value: string) => setVariantFilters((current) => {
      const next = { ...current[id] };
      if (value === '') delete next[group]; else next[group] = value;
      return { ...current, [id]: next };
    });
    // v2 variations/filters.tsx: a select per option group, then a chevron that folds the row.
    const bar = (
      <View key="filters" testID={`variation-filters-${id}`} className="flex-row items-center gap-2 border-t border-border px-3 py-1">
        <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
          {groups.map(({ name, values }) => (
            <Select key={name} value={{ value: picked[name] ?? '', label: picked[name] ? `${name}: ${picked[name]}` : name }}
              onValueChange={(option) => { if (option) pick(name, option.value); }}>
              <SelectTrigger testID={`variation-filter-${id}-${name}`} accessibilityLabel={picked[name] ? `${name}: ${picked[name]}` : name} className="h-9 w-auto">
                <SelectValue className="text-sm text-foreground" />
              </SelectTrigger>
              <SelectContent>
                {['', ...values].map((value) => (
                  <SelectItem key={value} value={value} label={value || name}>
                    <Text className="text-sm text-popover-foreground">{value || 'All'}</Text>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </View>
        <IconButton size="sm" testID={`variation-filters-${id}-collapse`} accessibilityLabel="Collapse" onPress={() => toggleExpanded(id)}>
          <View className="text-muted-foreground" style={{ transform: [{ rotate: '180deg' }] }}><ChevronDownIcon size={18} /></View>
        </IconButton>
      </View>
    );
    if (matching.length === 0) return [bar, <Text key="none" className="px-3 py-1.5 text-sm text-muted-foreground">No variants match.</Text>];
    return [bar, ...matching.map((entry) => (
      <View key={entry.variant.id} testID={`variation-row-${entry.variant.id}`} className="flex-row items-center gap-3 border-t border-border px-3 py-1.5">
        <View testID={`variation-row-${entry.variant.id}-chips`} className="min-w-0 flex-1 flex-row flex-wrap gap-1">
          {chipsOf(entry).map((chip, index) => <Text key={index} className="rounded bg-foreground/12 px-1.5 text-xs font-bold text-foreground">{chip}</Text>)}
        </View>
        <Text className="text-sm text-foreground">{variantPriceLabel(entry.variant, currency) ?? '—'}</Text>
        <Text className="text-xs text-muted-foreground">{STOCK_STATUS_LABELS[entry.variant.stock.status] ?? STOCK_STATUS_LABELS.unknown}</Text>
        <View style={{ width: VARIANT_ADD_WIDTH }} className="flex-none items-center">
          <IconButton testID={`variation-row-add-${entry.variant.id}`} accessibilityLabel="Add to cart" onPress={() => select(entry)}>
            <View className="text-muted-foreground"><PlusIcon size={18} /></View>
          </IconButton>
        </View>
      </View>
    ))];
  }

  // The variations popover (#719): the one open popover's product id, and each product's current entries in order.
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const entriesById = useMemo(() => {
    const byId = new Map<string, CatalogueEntry<Doc>[]>();
    if (variationsStyle !== 'popover') return byId;
    for (const entry of entries) {
      const id = traits.getId(entry.product);
      const list = byId.get(id);
      if (list) list.push(entry); else byId.set(id, [entry]);
    }
    return byId;
  }, [entries, traits, variationsStyle]);
  // A product that leaves the catalogue closes its popover.
  useEffect(() => { if (popoverId !== null && !entriesById.has(popoverId)) setPopoverId(null); }, [popoverId, entriesById]);
  // The groups the popover asks for; none means the list chooser. Without pickAnyOptions a group no variant sets is
  // left out: a variant leaving it unset fits any value.
  function popoverGroupsOf(product: Doc) {
    const list = entriesById.get(traits.getId(product)) ?? [];
    if (list.length < 2 || list.every(({ variant }) => variant.options === undefined)) return [];
    return (traits.getVariantOptions?.(product) ?? []).filter(({ id, name, values }) => values.length > 0
      && (list.some(({ variant }) => variant.options !== undefined && Object.prototype.hasOwnProperty.call(variant.options, name))
        || (pickAnyOptions && id === undefined)));
  }
  function addFromPopover(productId: string, variant: VariantSummary, anyPicks: Record<string, string>) {
    const entry = entriesById.get(productId)?.find((candidate) => candidate.variant.id === variant.id);
    if (!entry) return;
    // Only the local "Any" groups the picker step would ask for (#495) travel as picks.
    const picked = Object.fromEntries(anyGroupsOf(entry).filter(({ name }) => anyPicks[name] !== undefined)
      .map(({ name }) => [name, anyPicks[name]]));
    onSelect(pickAnyOptions && Object.keys(picked).length > 0 ? { ...entry, picks: picked } : entry);
    setPopoverId(null);
  }

  const emptyText = query.trim() ? `No products match "${query.trim()}".` : activeCategory ? `No products in ${activeCategory.name}.`
    : (activeTerms.length > 0 || ((saleFiltered || featuredFiltered) && shown.length > 0)) && items === undefined ? 'No products match the picked filters.'
    : stockFiltered && items === undefined && shown.length > 0 ? 'No products in stock.'
    : isLoading ? 'Loading products…' : items !== undefined && shown.length > 0 ? 'No products match the picked filters.' : 'No products yet.';
  // Where the text would say "Loading products…", v2 holds the screen in the shape of what is coming; the words stay
  // as the accessible label.
  const showLoading = emptyText === 'Loading products…';
  const emptyState = showLoading && state.view !== 'table' ? (
    <View accessibilityLabel="Loading products…" aria-busy testID="catalogue-loading" className="flex-1 overflow-hidden p-1"
      onLayout={(event) => setLoadingHeight(event.nativeEvent.layout.height)}>
      {Array.from({ length: skeletonCount(loadingHeight, tileRow(fields)) }, (_, row) => (
        <View key={row} className="flex-row">
          {Array.from({ length: columns }, (_, column) => (
            <View key={column} style={{ width: `${100 / columns}%` }} className="p-1">
              <View testID="catalogue-loading-tile" aria-busy className="items-center rounded-lg border border-transparent bg-muted p-3">
                <View style={{ width: TILE_IMAGE, height: TILE_IMAGE }} />
                <View testID="catalogue-loading-band" style={{ height: tileBand(fields) }} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  ) : <Text className="mt-10 text-center text-sm text-muted-foreground">{emptyText}</Text>;

  const searchInput = <SearchInput value={query} onChangeText={(text) => {
    // A search typed inside a level leaves it and spans every product (v2 browse/use-browse-path.ts:521-534).
    if (browsing && level && text.trim() !== '') back();
    setQuery(text); onQueryChange?.(text);
  }} placeholder="Search or scan barcode / SKU" autoFocus
    onSubmitEditing={() => {
      if (minCodeLength && query.trim().length < minCodeLength) return;
      const entry = findEntryByCode(entries, query);
      if (entry) { select(entry); setQuery(''); onQueryChange?.(''); }
    }} />;
  const levelItems = level && results.length > 0 ? [LEVEL_PARENT, ...results] : results;
  // A level's slots are dealt out of the tapped tile (category-deal.tsx); any other grid renders as before.
  const dealt = (render: (product: Doc) => ReactNode) => (product: Doc, index: number) =>
    level ? <DealCell index={index} count={levelItems.length}>{render(product)}</DealCell> : render(product);

  return (
    <View className="flex-1" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View className="gap-2 border-b border-border bg-card px-4 pb-3 pt-3">
        {(cameraScan && cameraScanner) || showViewToggle || draws(searchAccessory) ? (
          <View testID="catalogue-search-row" className="flex-row items-center gap-2" style={coarse ? { minHeight: band } : undefined}>
            <View className="min-w-0 flex-1 flex-row"><View testID="catalogue-search" className={cn('min-w-0 flex-1', !phone && 'max-w-160')}>{searchInput}</View></View>
            {cameraScan && cameraScanner ? <CameraScanButton open={scannerOpen} onPress={() => setScannerOpen((open) => !open)} /> : null}
            {showViewToggle ? <ViewToggle variant="icon" className="self-center" value={state.view} onChange={(view) => changeState({ type: 'setView', view })} /> : null}
            {draws(searchAccessory) ? searchAccessory : null}
          </View>
        ) : searchInput}
        {showFilterBar ? <ProductFilterBar value={filters} onChange={changeFilters}
          chips={traits.getFeatured === undefined ? filterChips.filter((chip) => chip !== 'featured') : filterChips}
          termGroups={termGroups.length > 0 ? termGroups.map((group) => ({
            id: group.id, label: group.name, options: group.terms.map((term) => ({ value: term.id, label: term.name })),
            value: activeTerms.find(([id]) => id === group.id)?.[1], onChange: (term: string | undefined) => pickTerm(group.id, term),
          })) : undefined} /> : null}
        {cameraScan && cameraScanner && scannerOpen ?<CameraScannerPanel {...cameraScanner} onClose={() => setScannerOpen(false)} /> : null}
        {(statusText || statusAccessory) ? (
          <View testID="catalogue-status-row" className="flex-row items-center gap-2">
            {statusText ? <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={statusAccessory ? 1 : undefined}>
              {statusText}{query.trim() ? ` · ${results.length.toLocaleString()} matching` : ''}
            </Text> : null}
            {statusAccessory}
          </View>
        ) : null}
        {showCategoryNav && !browsing ? <CategoryNav categories={[{ id: '', name: 'All products' }, ...categoryList]}
          selectedId={activeCategory?.id ?? ''}
          onSelect={(id) => changeState({ type: 'setCategory', categoryId: id === '' ? null : id })} /> : null}
        {pickEntry ? (
          <View accessibilityLabel="Choose options" className="gap-2">
            <Text className="font-semibold text-foreground">{pickEntry.variant.title ?? traits.getName(pickEntry.product)}</Text>
            <ProductVariantPicker options={anyGroups.map(({ name, values }) => ({ name, values }))} selected={picks} onSelect={setPicks} />
            <Pressable accessibilityRole="button" disabled={!allPicked} onPress={() => { onSelect({ ...pickEntry, picks }); closePicker(); }}
              className={`rounded-md border border-border bg-card px-4 py-3 ${allPicked ? '' : 'opacity-50'}`}>
              <Text className="text-center text-foreground">Add to cart</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={closePicker} className="rounded-md border border-border bg-card px-4 py-3">
              <Text className="text-center text-foreground">Cancel</Text>
            </Pressable>
          </View>
        ) : choices.length > 0 ? (
          <View accessibilityLabel="Choose variant" className="gap-2">
            {choices.map((entry) => (
              <Pressable key={entry.variant.id} accessibilityRole="button" onPress={() => select(entry)}
                className="gap-1 rounded-md border border-border p-3">
                <Text className="font-semibold text-foreground">{entry.variant.title}</Text>
                <Text className="text-muted-foreground">{entry.variant.sku}</Text>
                <Text className="text-foreground">{variantPriceLabel(entry.variant, currency)}</Text>
                <Text className="text-muted-foreground">{STOCK_STATUS_LABELS[entry.variant.stock.status]} · {stockAsOf ? `as of ${formatStockSyncTime(stockAsOf, undefined, hour12)}` : 'not yet synced'}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setChooserId(null)} className="rounded-md border border-border bg-card px-4 py-3">
              <Text className="text-center text-foreground">Cancel</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {draws(rowsSlot) ? <View testID="catalogue-rows" className="gap-4 p-4">{rowsSlot}</View> : null}
      <DealStage>{(deal) => atRoot ? <CategoryBrowseGrid categories={categoryList} counts={counts} total={shown.length} columns={columns}
        onOpen={(id, node) => deal.open(node, () => { setCrumbFocus(true); if (id === null) setAllOpen(true); else changeState({ type: 'setCategory', categoryId: id }); }, id)} /> : <LevelWrap level={!!level} onBack={() => deal.back(back)}>
      {level && drillEntries.length === 0 ? <Breadcrumb testID="category-crumb" phone={phone} autoFocus={crumbFocus}
        parents={[{ label: 'Categories', testID: 'category-crumb-root', onPress: () => deal.back(back) }]} here={activeCategory?.name ?? 'All products'} /> : null}
      {state.view === 'table' ? (
        <ProductTable items={results} sort={state.sort} onSortChange={(sort) => changeState({ type: 'setSort', sort })}
          sortItems={false} onSelect={selectProduct} emptyState={emptyState} loading={showLoading}
          showThumbnail={tableRow?.thumbnail} showAddButton={tableRow?.addButton}
          isExpanded={tableRow?.expand ? (doc) => expandedIds.has(traits.getId(doc)) : undefined}
          onToggleExpand={tableRow?.expand ? (doc) => toggleExpanded(traits.getId(doc)) : undefined}
          renderExpanded={tableRow?.expand ? variantRows : undefined} variationsButton={tableRow?.variationsButton}
          cartQuantity={(doc) => quantities.get(traits.getId(doc)) ?? 0} />
      ) : drillEntries.length > 0 ? <LevelWrap level onBack={() => setDrillId(null)}>
        {/* v2 drill-in.tsx:44-68: "Products › name" above the variant tiles; at phone width the Breadcrumb drops the separator. */}
        <Breadcrumb testID="products-breadcrumb" phone={phone} autoFocus
          parents={[{ label: 'Products', testID: 'products-breadcrumb-back', onPress: () => setDrillId(null) }]}
          here={traits.getName(drillEntries[0].product)} />
        <ProductGrid numColumns={columns} showUnsellable
        items={[{ id: 'parent' }, ...drillEntries.map((entry) => ({ id: `variant-${entry.variant.id}`, entry }))]}
        renderItem={({ entry }: { entry?: CatalogueEntry<Doc> }) => entry
          ? <VariantTile testID={`variation-tile-${entry.variant.id}`} name={traits.getName(entry.product)} chips={chipsOf(entry)}
            price={variantPriceLabel(entry.variant, currency)} stockStatus={entry.variant.stock.status} onPress={() => select(entry)}
            fields={fields} sku={entry.variant.sku} barcode={entry.variant.barcode}
            inCart={variantQuantities.get(entry.variant.id) ?? 0} />
          : <VariantParentTile doc={drillEntries[0].product} onPress={() => setDrillId(null)} />} />
      </LevelWrap>
      : <ProductGrid items={levelItems} numColumns={columns}
        renderItem={dealt((product: Doc) => {
          if (product === LEVEL_PARENT) return <CategoryTile testID="category-level-parent" back stacked accessibilityLabel={t('common.back')}
            name={activeCategory?.name ?? 'All products'} imageUrl={activeCategory?.imageUrl}
            mark={activeCategory ? 'folder' : 'all'} count={results.length} onPress={() => deal.back(back)} />;
          const id = traits.getId(product);
          const groups = variationsStyle === 'popover' ? popoverGroupsOf(product) : [];
          const tileTestID = `product-tile-${traits.getName(product)}`;
          const stacked = variationsStyle === 'drill' && (entryCounts.get(id) ?? 0) > 1;
          // TallyUI's ProductCard has no children slot, so the tile is composed directly here
          // (same structure/classes as ProductCard) to add the stock badge as a fourth child,
          // inside the card and centred with the rest, rather than adding a slot to ProductCard (out of scope for TV6b).
          const tile = (
            <Pressable accessibilityRole="button" testID={tileTestID}
              // v2 product-tile.tsx:81: with the name off, the name stays the tile's label.
              {...(fields.name ? {} : { accessibilityLabel: traits.getName(product) })}
              onPress={groups.length > 0 ? () => { closePicker(); setChooserId(null); } : () => selectProduct(product)}>
              {({ pressed }) => <>
              {stacked ? <TileStack id={tileTestID} /> : null}
              <VStack space="sm" className="items-center rounded-lg border border-border bg-card p-3">
                <ProductImage doc={product} size={80} className="rounded-md" />
                <TileWords doc={product} traits={traits} fields={fields} />
              </VStack>
              <PressVeil pressed={pressed} className="rounded-lg" />
              <InCartBadge count={quantities.get(id) ?? 0} className="absolute right-2 top-2" testID={`in-cart-${id}`} />
              </>}
            </Pressable>
          );
          if (groups.length === 0) return tile;
          // ui's PopoverContent class, built on the primitive as LinePopover is so an Overlay in the same portal closes
          // it on a press outside (v2's outsidePress). Content takes only side 'top' | 'bottom', so v2's side="right" is left out.
          return (
            <Popover.Root open={popoverId === id} onOpenChange={(open) => setPopoverId((current) => open ? id : current === id ? null : current)}>
              <Popover.Trigger asChild>{tile}</Popover.Trigger>
              <Popover.Portal>
                <Popover.Overlay testID="variation-popover-overlay" style={StyleSheet.absoluteFill} />
                <Popover.Content align="center" sideOffset={4}
                  className="z-50 w-auto max-w-80 rounded-md border border-border bg-popover p-2 shadow-md outline-none">
                  <VariationPicker key={id} title={traits.getName(product)} groups={groups} currency={currency}
                    variants={(entriesById.get(id) ?? []).map(({ variant }) => variant)}
                    onAdd={(variant, anyPicks) => addFromPopover(id, variant, anyPicks)} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          );
        })}
        emptyState={emptyState} />}
      </LevelWrap>}</DealStage>
    </View>
  );
}

// The words under a grid tile's image, as v2's tile-words.tsx: a field that is off is not drawn; the facts (SKU,
// barcode, categories) come after the price, each one line, only when on and set (tile-words.tsx:110-162).
function TileWords<Doc>({ doc, traits, fields }: { doc: Doc; traits: ProductTraits<Doc>; fields: TileFields }) {
  const sku = traits.getSku(doc);
  const facts = [
    ['sku', fields.sku && sku ? `SKU ${sku}` : ''],
    ['barcode', fields.barcode ? traits.getBarcode(doc) ?? '' : ''],
    ['categories', fields.categories ? traits.getCategoryNames(doc).join(', ') : ''],
  ].filter(([, text]) => text);
  return <>
    {fields.name ? <ProductTitle doc={doc} className="text-sm" numberOfLines={2} /> : null}
    {fields.price ? <ProductPrice doc={doc} {...(fields.onSale ? {} : { showWas: false })} /> : null}
    {facts.map(([key, text]) => <Text key={key} numberOfLines={1} className="text-center text-xs text-muted-foreground">{text}</Text>)}
    {fields.stock ? <ProductStockBadge doc={doc} showAsOf={false} className="self-center" />
      : fields.price ? <OutOfStockMark doc={doc} /> : null}
  </>;
}

// With stock off, an out-of-stock product still says so while its price shows (v2 tile-words.tsx:66-71). Its own
// component so useProductStock runs only on this path, never on the default tile.
function OutOfStockMark({ doc }: { doc: unknown }) {
  return useProductStock(doc).status === 'out_of_stock' ? <ProductStockBadge doc={doc} showAsOf={false} className="self-center" /> : null;
}

// An open category is a level: on web, Escape inside it goes back (v2 packages/core/src/screens/main/pos/products/
// level-back.tsx:37-49, the web part only). Outside a level the children render as before, with no wrapper.
function LevelWrap({ level, onBack, children }: { level: boolean; onBack: () => void; children: ReactNode }) {
  if (!level) return <>{children}</>;
  return (
    // RN's View types lack onKeyDown; react-native-web passes it to the div (as open-sale-tabs.tsx does).
    <View className="flex-1" {...(Platform.OS === 'web' ? {
      onKeyDown: (event: { nativeEvent: { key: string }; stopPropagation: () => void }) => {
        if (event.nativeEvent.key === 'Escape') { event.stopPropagation(); onBack(); }
      },
    } : {})}>{children}</View>
  );
}
