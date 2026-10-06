import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStockOverlaid, useStockOverlayAsOf, type ProductTraits } from '@tallyui/core';
import { catalogueEntries, findEntryByCode, searchProducts, variantPriceLabel, sortProducts, productSortValue,
  catalogueViewReducer, normalizeCatalogueViewState, resolveGridColumns, DEFAULT_CATALOGUE_VIEW_STATE,
  type CatalogueEntry, type CatalogueViewState, type CatalogueViewAction } from '@tallyui/pos';
import { ProductGrid, ProductImage, ProductPrice, ProductStockBadge, ProductTitle, ProductTable, ViewToggle } from '../product';
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
  viewState, defaultViewState, loadViewState, saveViewState, onViewStateError, onStateChange, showViewToggle = false, items, onQueryChange }: {
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
  /** App-filtered, sorted list shown as given; products still drives scanning and variant choices. */
  items?: Doc[];
  /** Search text on every input change, for apps that filter items themselves. */
  onQueryChange?: (query: string) => void;
}) {
  const [initial] = useState<{
    state: CatalogueViewState; loaded?: CatalogueViewState; pending?: Promise<unknown>; failed?: boolean; error?: unknown;
  }>(() => {
    const state = normalizeCatalogueViewState({ ...DEFAULT_CATALOGUE_VIEW_STATE, ...defaultViewState });
    if (viewState !== undefined || !loadViewState) return { state };
    try {
      const value = loadViewState();
      if (value instanceof Promise) return { state, pending: value };
      const loaded = normalizeCatalogueViewState(value);
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
      const loaded = normalizeCatalogueViewState(value);
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

  const isLoading = loading ?? (lastSyncedAt === null && pullError == null);
  // Idempotent (the adapter's overlay returns just the fields the stock map sets), so an app that already
  // merges the overlay itself keeps working, and can drop its own merge.
  const shown = useStockOverlaid(products) as Doc[];
  const suppliedItems = useStockOverlaid(items ?? products) as Doc[];
  const overlayAsOf = useStockOverlayAsOf();
  const parsedOverlayAsOf = overlayAsOf ? new Date(overlayAsOf) : undefined;
  const validOverlayAsOf = parsedOverlayAsOf && !isNaN(parsedOverlayAsOf.getTime()) ? parsedOverlayAsOf : undefined;
  const stockAsOf = laterOf(laterOf(lastStockCheckAt, validOverlayAsOf), lastSyncedAt);
  const [query, setQuery] = useState('');
  // The chooser is live (medusapos ADR 0007): it holds only the chosen product's id and derives its choices
  // from the current entries below, so an open chooser shows each reconcile pass as it lands.
  const [chooserId, setChooserId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const columns = resolveGridColumns(state.gridColumns, width);
  const entries = useMemo(() => catalogueEntries(shown, traits, { currency }), [shown, traits, currency]);
  const results = useMemo(() => {
    if (items !== undefined) return suppliedItems;
    const filtered = searchProducts(shown, query, traits);
    return state.sort ? sortProducts(filtered, state.sort, (doc, field) => productSortValue(doc, field, traits, { currency })) : filtered;
  }, [items, suppliedItems, shown, query, traits, state.sort, currency]);
  const choices = useMemo(() => (chooserId === null ? []
    : entries.filter((entry) => traits.getId(entry.product) === chooserId)), [entries, chooserId, traits]);
  // A product that leaves the catalogue (a resync, or no longer sellable) closes its chooser.
  useEffect(() => { if (chooserId !== null && choices.length === 0) setChooserId(null); }, [chooserId, choices]);

  function select(entry: CatalogueEntry<Doc>) {
    onSelect(entry);
    setChooserId(null);
  }

  function selectProduct(product: Doc) {
    const variants = entries.filter((entry) => traits.getId(entry.product) === traits.getId(product));
    if (variants.length === 1) select(variants[0]);
    else setChooserId(traits.getId(product));
  }

  const emptyState = <Text className="mt-10 text-center text-sm text-muted-foreground">
    {query.trim() ? `No products match "${query.trim()}".` : isLoading ? 'Loading products…' : 'No products yet.'}
  </Text>;

  return (
    <View className="flex-1" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View className="gap-2 border-b border-border bg-card px-4 pb-3 pt-3">
        <SearchInput value={query} onChangeText={(text) => { setQuery(text); onQueryChange?.(text); }} placeholder="Search or scan barcode / SKU" autoFocus
          onSubmitEditing={() => {
            if (minCodeLength && query.trim().length < minCodeLength) return;
            const entry = findEntryByCode(entries, query);
            if (entry) { select(entry); setQuery(''); }
          }} />
        {(statusText || statusAccessory || showViewToggle) ? (
          <View testID="catalogue-status-row" className="flex-row items-center gap-2">
            {statusText ? <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={statusAccessory ? 1 : undefined}>
              {statusText}{query.trim() ? ` · ${results.length.toLocaleString()} matching` : ''}
            </Text> : null}
            {statusAccessory}
            {showViewToggle ? <ViewToggle value={state.view} onChange={(view) => changeState({ type: 'setView', view })} /> : null}
          </View>
        ) : null}
        {choices.length > 0 ? (
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
        renderItem={(product: Doc) => (
          // TallyUI's ProductCard has no children slot, so the tile is composed directly here
          // (same structure/classes as ProductCard) to add the stock badge as a fourth child,
          // inside the card and centred with the rest, rather than adding a slot to ProductCard (out of scope for TV6b).
          <Pressable accessibilityRole="button" testID={`product-tile-${traits.getName(product)}`} onPress={() => selectProduct(product)}>
            <VStack space="sm" className="items-center rounded-lg border border-border bg-card p-3">
              <ProductImage doc={product} size={80} className="rounded-md" />
              <ProductTitle doc={product} className="text-sm" numberOfLines={2} />
              <ProductPrice doc={product} />
              <ProductStockBadge doc={product} showAsOf={false} className="self-center" />
            </VStack>
          </Pressable>
        )}
        emptyState={emptyState} />}
    </View>
  );
}
