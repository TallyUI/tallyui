// Ported from WCPOS v2 packages/core/src/screens/main/pos/products/ui-settings-form.tsx (Tile Size and Tile Fields)
// and contexts/ui-settings/use-ui-label.ts (the labels), MIT, WCPOS. TallyUI adds the Auto switch for
// `gridColumns: 'auto'`.
import type { JSX } from 'react';
import { View, type ViewProps } from 'react-native';
import { DEFAULT_CATALOGUE_VIEW_STATE, DEFAULT_TILE_FIELDS } from '@tallyui/pos';
import type { CatalogueGridColumns, TileField, TileFields } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Text } from '../ui/text';

/** Each tile field's catalogue key, v2's `use-ui-label.ts`. */
const LABELS: Record<TileField, string> = {
  name: 'common.product_name', price: 'common.price', onSale: 'common.on_sale', categories: 'common.categories',
  sku: 'common.sku', barcode: 'common.barcode', stock: 'common.stock',
};

/** v2's default products per row, emitted when Auto is turned off. */
const V2_TILE_SIZE = 4;

export interface CatalogueSettingsFormProps extends Omit<ViewProps, 'children'> {
  /** The products-per-row setting (default `'auto'`), from the app's CatalogueViewState. */
  gridColumns?: CatalogueGridColumns;
  onGridColumnsChange: (next: CatalogueGridColumns) => void;
  /** The saved tile fields, merged over DEFAULT_TILE_FIELDS (default: today's tile). */
  tileFields?: Partial<TileFields>;
  /** Called with a fresh, full TileFields on every switch; the form stores nothing. */
  onTileFieldsChange: (next: TileFields) => void;
  /** Draw Restore Default Settings, which emits 'auto' and DEFAULT_TILE_FIELDS (default false). */
  showReset?: boolean;
  className?: string;
  /** Default `catalogue-settings`. */
  testID?: string;
}

/**
 * v2's product settings: Tile Size (an Auto switch, then a 2 to 8 slider) and a Tile Fields switch per tile word.
 * It emits `gridColumns` for the catalogue view state and a `TileFields` for `Catalogue`'s `tileFields`.
 *
 * ```tsx
 * <CatalogueSettingsForm gridColumns={view.gridColumns} onGridColumnsChange={setColumns}
 *   tileFields={settings['catalogue.tileFields']} onTileFieldsChange={(next) => setSetting('catalogue.tileFields', next)} />
 * ```
 */
export function CatalogueSettingsForm({
  gridColumns = 'auto', onGridColumnsChange, tileFields, onTileFieldsChange, showReset = false, className,
  testID = 'catalogue-settings', ...viewProps
}: CatalogueSettingsFormProps): JSX.Element {
  const t = useT();
  const merged: TileFields = { ...DEFAULT_TILE_FIELDS, ...tileFields };
  const auto = gridColumns === 'auto';
  return (
    <View testID={testID} className={cn('gap-1', className)} {...viewProps}>
      <Text role="heading" aria-level={4} className="pb-1 text-base font-semibold">{t('common.tile_size')}</Text>
      <View className="flex-row items-center gap-3 py-1">
        <Switch testID={`${testID}-auto`} accessibilityLabel={t('common.auto')} checked={auto}
          onCheckedChange={(on) => onGridColumnsChange(on ? 'auto' : V2_TILE_SIZE)} />
        <Text className="flex-1">{t('common.auto')}</Text>
      </View>
      {auto ? null : (
        <View className="flex-row items-center gap-3 py-1">
          <Slider testID={`${testID}-tile-size`} accessibilityLabel={t('common.tile_size')} className="flex-1"
            value={gridColumns} min={2} max={8} step={1}
            onValueChange={(n) => onGridColumnsChange(n as CatalogueGridColumns)} /* snapped to 2..8, step 1 */ />
          <Text className="w-6 text-right tabular-nums">{String(gridColumns)}</Text>
        </View>
      )}
      <Text role="heading" aria-level={4} className="pb-1 pt-3 text-base font-semibold">{t('common.tile_fields')}</Text>
      {(Object.keys(DEFAULT_TILE_FIELDS) as TileField[]).map((field) => {
        const label = t(LABELS[field]);
        return (
          <View key={field} className="flex-row items-center gap-3 py-1">
            <Switch testID={`${testID}-field-${field}`} accessibilityLabel={label} checked={merged[field]}
              onCheckedChange={(on) => onTileFieldsChange({ ...merged, [field]: on })} />
            <Text className="flex-1">{label}</Text>
          </View>
        );
      })}
      {showReset ? (
        <Button variant="outline" testID={`${testID}-reset`} className="mt-2 self-start" onPress={() => {
          onGridColumnsChange(DEFAULT_CATALOGUE_VIEW_STATE.gridColumns);
          onTileFieldsChange({ ...DEFAULT_TILE_FIELDS });
        }}>
          <Text>{t('common.restore_default_settings')}</Text>
        </Button>
      ) : null}
    </View>
  );
}
