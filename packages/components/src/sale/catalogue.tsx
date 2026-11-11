import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStockOverlaid, useStockOverlayAsOf, type ProductTraits, type ProductCategory, type VariantSummary } from '@tallyui/core';
import { catalogueEntries, findEntryByCode, searchProducts, variantPriceLabel, sortProducts, productSortValue,
  catalogueViewReducer, normalizeCatalogueViewState, resolveGridColumns, DEFAULT_CATALOGUE_VIEW_STATE,
  listCategories, inCategory, cartQuantities,
  type CatalogueEntry, type CatalogueViewState, type CatalogueViewAction, type CartQuantityLine } from '@tallyui/pos';
import { ProductGrid, ProductImage, ProductPrice, ProductStockBadge, ProductTitle, ProductTable, ViewToggle, CategoryNav } from '../product';
import { ProductVariantPicker } from '../product/product-variant-picker';
import { VariationPicker } from '../product/variation-picker';
import { InCartBadge } from '../product/in-cart-badge';
import { Popover } from '@tallyui/primitives';
import { CameraScanButton } from '../product/camera-scan-button';
import { CameraScannerPanel, type CameraScannerPanelProps } from '../product/camera-scanner-panel';
import { ProductFilterBar, DEFAULT_PRODUCT_FILTERS, type ProductFilterChip, type ProductFilters } from './product-filter-bar';
import { SearchInput } from '../input';
import { VStack } from '../ui';

const STOCK_LABEL = {
  in_stock: 'In Stock', out_of_stock: 'Out of Stock', backorder: 'On Backorder', unknown: 'Unknown',
};

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

export function Catalogue<Doc>({ products, traits, currency, onSelect, statusText, statusAccessory, lastSyncedAt, loading, pullError, lastStockCheckAt, hour12, minCodeLength,
  viewState, defaultViewState, loadViewState, saveViewState, onViewStateError, onStateChange, showViewToggle = false, items, onQueryChange, showCategoryNav = false, categories, pickAnyOptions = false,
  cartLines, showFilterBar = false, filterChips = ['inStock'], filters: filtersProp, onFiltersChange, variationsStyle = 'list', cameraScan = false, cameraScanner }: {
  products: Doc[];
  traits: ProductTraits<Doc>;
  currency: string;
  /** Receives the chosen product and variant with the nearest ConnectorProvider's stock overlay applied (a copy). */
  onSelect: (entry: CatalogueEntry<Doc>) => void;
  statusText?: string;
  /** Rendered at the end of the status line, e.g. a register control at phone width; the row renders even without `statusText`. */
  statusAccessory?: ReactNode;
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
  /** Show the grid/table toggle in the header. Default false. */
  showViewToggle?: boolean;
  /** Show the category nav in the header. Default false. */
  showCategoryNav?: boolean;
  /** Replaces the categories derived from the listed products. */
  categories?: ProductCategory[];
  /** App-filtered, sorted list shown as given; products still drives scanning and variant choices. */
  items?: Doc[];
  /** Search text on every input change, for apps that filter items themselves. */
  onQueryChange?: (query: string) => void;
  /** Ask for a value for each of a variant's local "Any" option groups before onSelect (#495); set it only when the store accepts order.create version 6. */
  pickAnyOptions?: boolean;
  /** The open sale's lines (e.g. useSale's order.lineItems); each grid tile shows its product's summed quantity. */
  cartLines?: readonly CartQuantityLine[];
  /** Show v2's filter chips under the search box. Default false. */
  showFilterBar?: boolean;
  /** Which chips the bar shows. Default ['inStock'], the one Catalogue applies itself. */
  filterChips?: readonly ProductFilterChip[];
  /** Controlled filters; changes are reported through onFiltersChange. */
  filters?: ProductFilters;
  /** The cashier's next filters (requested filters when controlled). */
  onFiltersChange?: (filters: ProductFilters) => void;
  /** v2's Product settings › Variations. 'list' (default) opens the variant list chooser; 'popover' opens a grid tile's
   * VariationPicker in a popover for a product with option groups. The table view keeps the list chooser. */
  variationsStyle?: 'list' | 'popover';
  /** Show v2's camera scan button beside the search box; it opens an inline CameraScannerPanel. Default false.
   * The button shows only when cameraScanner is passed too. */
  cameraScan?: boolean;
  /** Passed to the CameraScannerPanel. The app owns useCameraScan (inside its ScanHubProvider) and passes its wiring
   * here, { onDetected: camera.offer, onOpen: camera.reset, scanCount: camera.scanCount }, plus height, permission,
   * viewfinder, decoder and readiness; its useBarcodeScanner then handles camera scans like device scans. */
  cameraScanner?: Omit<CameraScannerPanelProps, 'onClose'>;
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

  const isLoading = loading ?? (lastSyncedAt === null && pullError == null);
  // Idempotent (the adapter's overlay returns just the fields the stock map sets), so an app that already
  // merges the overlay itself keeps working, and can drop its own merge.
  const shown = useStockOverlaid(products) as Doc[];
  const categoryList = useMemo(() => categories ?? listCategories(shown, traits), [categories, shown, traits]);
  const activeCategory = showCategoryNav ? categoryList.find((category) => category.id === state.categoryId) : undefined;
  const suppliedItems = useStockOverlaid(items ?? products) as Doc[];
  const overlayAsOf = useStockOverlayAsOf();
  const parsedOverlayAsOf = overlayAsOf ? new Date(overlayAsOf) : undefined;
  const validOverlayAsOf = parsedOverlayAsOf && !isNaN(parsedOverlayAsOf.getTime()) ? parsedOverlayAsOf : undefined;
  const stockAsOf = laterOf(laterOf(lastStockCheckAt, validOverlayAsOf), lastSyncedAt);
  const [query, setQuery] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  // The chooser is live (medusapos ADR 0007): it holds only the chosen product's id and derives its choices
  // from the current entries below, so an open chooser shows each reconcile pass as it lands.
  const [chooserId, setChooserId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const columns = resolveGridColumns(state.gridColumns, width);
  const entries = useMemo(() => catalogueEntries(shown, traits, { currency }), [shown, traits, currency]);
  // v2's In Stock pill is stock_status 'instock', so it drops backorders too; a stock the backend did not report stays.
  const stockFiltered = showFilterBar && filters.inStock;
  const results = useMemo(() => {
    if (items !== undefined) return suppliedItems;
    const matched = searchProducts(activeCategory
      ? shown.filter((doc) => inCategory(doc, activeCategory.id, traits)) : shown, query, traits);
    const filtered = stockFiltered
      ? matched.filter((doc) => !['out_of_stock', 'backorder'].includes(traits.getStock(doc).status)) : matched;
    return state.sort ? sortProducts(filtered, state.sort, (doc, field) => productSortValue(doc, field, traits, { currency })) : filtered;
  }, [items, suppliedItems, shown, query, traits, state.sort, currency, showCategoryNav, activeCategory, stockFiltered]);
  const choices = useMemo(() => (chooserId === null ? []
    : entries.filter((entry) => traits.getId(entry.product) === chooserId)), [entries, chooserId, traits]);
  // A product that leaves the catalogue (a resync, or no longer sellable) closes its chooser.
  useEffect(() => { if (chooserId !== null && choices.length === 0) setChooserId(null); }, [chooserId, choices]);

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
    else { closePicker(); setChooserId(traits.getId(product)); }
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

  const emptyState = <Text className="mt-10 text-center text-sm text-muted-foreground">
    {query.trim() ? `No products match "${query.trim()}".` : activeCategory ? `No products in ${activeCategory.name}.`
      : stockFiltered && items === undefined && shown.length > 0 ? 'No products in stock.'
      : isLoading ? 'Loading products…' : 'No products yet.'}
  </Text>;

  const searchInput = <SearchInput value={query} onChangeText={(text) => { setQuery(text); onQueryChange?.(text); }} placeholder="Search or scan barcode / SKU" autoFocus
    onSubmitEditing={() => {
      if (minCodeLength && query.trim().length < minCodeLength) return;
      const entry = findEntryByCode(entries, query);
      if (entry) { select(entry); setQuery(''); }
    }} />;

  return (
    <View className="flex-1" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View className="gap-2 border-b border-border bg-card px-4 pb-3 pt-3">
        {cameraScan && cameraScanner ? (
          <View className="flex-row items-center gap-2">
            <View className="flex-1">{searchInput}</View>
            <CameraScanButton open={scannerOpen} onPress={() => setScannerOpen((open) => !open)} />
          </View>
        ) : searchInput}
        {showFilterBar ? <ProductFilterBar value={filters} onChange={changeFilters} chips={filterChips} /> : null}
        {cameraScan && cameraScanner && scannerOpen ?<CameraScannerPanel {...cameraScanner} onClose={() => setScannerOpen(false)} /> : null}
        {(statusText || statusAccessory || showViewToggle) ? (
          <View testID="catalogue-status-row" className="flex-row items-center gap-2">
            {statusText ? <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={statusAccessory ? 1 : undefined}>
              {statusText}{query.trim() ? ` · ${results.length.toLocaleString()} matching` : ''}
            </Text> : null}
            {statusAccessory}
            {showViewToggle ? <ViewToggle value={state.view} onChange={(view) => changeState({ type: 'setView', view })} /> : null}
          </View>
        ) : null}
        {showCategoryNav ? <CategoryNav categories={[{ id: '', name: 'All products' }, ...categoryList]}
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
                <Text className="text-muted-foreground">{STOCK_LABEL[entry.variant.stock.status]} · {stockAsOf ? `as of ${formatStockSyncTime(stockAsOf, undefined, hour12)}` : 'not yet synced'}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setChooserId(null)} className="rounded-md border border-border bg-card px-4 py-3">
              <Text className="text-center text-foreground">Cancel</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {state.view === 'table' ? (
        <ProductTable items={results} sort={state.sort} onSortChange={(sort) => changeState({ type: 'setSort', sort })}
          sortItems={false} onSelect={selectProduct} emptyState={emptyState} />
      ) : <ProductGrid items={results} numColumns={columns}
        renderItem={(product: Doc) => {
          const id = traits.getId(product);
          const groups = variationsStyle === 'popover' ? popoverGroupsOf(product) : [];
          // TallyUI's ProductCard has no children slot, so the tile is composed directly here
          // (same structure/classes as ProductCard) to add the stock badge as a fourth child,
          // inside the card and centred with the rest, rather than adding a slot to ProductCard (out of scope for TV6b).
          const tile = (
            <Pressable accessibilityRole="button" testID={`product-tile-${traits.getName(product)}`}
              onPress={groups.length > 0 ? () => { closePicker(); setChooserId(null); } : () => selectProduct(product)}>
              <VStack space="sm" className="items-center rounded-lg border border-border bg-card p-3">
                <ProductImage doc={product} size={80} className="rounded-md" />
                <ProductTitle doc={product} className="text-sm" numberOfLines={2} />
                <ProductPrice doc={product} />
                <ProductStockBadge doc={product} showAsOf={false} className="self-center" />
              </VStack>
              <InCartBadge count={quantities.get(id) ?? 0} className="absolute right-2 top-2" testID={`in-cart-${id}`} />
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
        }}
        emptyState={emptyState} />}
    </View>
  );
}
