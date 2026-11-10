/**
 * Settings › Display: theme, scale and fonts, device-local through `useAppSettings`.
 * Port of WCPOS v2 `packages/core/src/screens/main/settings/theme.tsx` (`ThemeSettingsContent`,
 * `ScaleSection`, `FontsSection`); the labels are v2's English strings from
 * `core/contexts/translations/locales/en/core.json`. v2's icons section has no TallyUI counterpart.
 */
import { Platform, View } from 'react-native';
import type { JSX } from 'react';
import { UI_SCALES, UI_THEMES, type AppSettingKey, type AppSettings, type UiScale, type UiTheme, type useAppSettings } from '@tallyui/pos';
import { FONT_SETTINGS, TYPE_SETS, cn, fontFamilyStyle } from '@tallyui/theme';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Text } from '../ui/text';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { SettingsGroup } from './settings-group';

type FontSetting = (typeof FONT_SETTINGS)[number];

export interface DisplaySettingsProps {
  /** The hook's settings: `<DisplaySettings {...useAppSettings(db.app_settings)} />`. */
  settings: Pick<AppSettings, 'ui.theme' | 'ui.scale' | 'ui.font'>;
  setSetting: ReturnType<typeof useAppSettings>['setSetting'];
  className?: string;
}

const THEME_OPTIONS: Record<UiTheme, { label: string; description: string }> = {
  system: { label: 'System', description: 'Follow your device settings' },
  light: { label: 'Light', description: 'Clean and bright' },
  dark: { label: 'Dark', description: 'Easy on the eyes' },
};

const SCALE_LABELS: Record<UiScale, string> = {
  auto: 'Auto', compact: 'Compact', regular: 'Regular', spacious: 'Spacious',
};

const FONT_LABELS: Record<FontSetting, string> = {
  auto: 'Match theme',
  system: 'System',
  instrument: 'DM Sans · Instrument Serif',
  grotesk: 'Space Grotesk',
  fraunces: 'DM Sans · Fraunces',
  manrope: 'Manrope',
};

interface OptionRowProps {
  id: string;
  testID: string;
  label: string;
  description?: string;
  onSelect: () => void;
  right?: JSX.Element;
}

function OptionRow({ id, testID, label, description, onSelect, right }: OptionRowProps): JSX.Element {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <RadioGroupItem value={id} testID={testID} aria-label={label} />
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground" onPress={onSelect}>{label}</Text>
        {description && <Text className="text-xs text-muted-foreground">{description}</Text>}
      </View>
      {right}
    </View>
  );
}

export function DisplaySettings({ settings, setSetting, className }: DisplaySettingsProps): JSX.Element {
  const save = <K extends AppSettingKey>(key: K, value: AppSettings[K]) => {
    setSetting(key, value).catch((error: unknown) => console.error('Failed to save display setting', error));
  };
  const theme = settings['ui.theme'];
  const scale = settings['ui.scale'];
  // A retired or unknown set shows Auto, as `resolveTypeSet` falls back.
  const font = FONT_SETTINGS.find((id) => id === settings['ui.font']) ?? 'auto';
  const isWeb = Platform.OS === 'web';

  return (
    <View className={cn('gap-6', className)}>
      <SettingsGroup title="Theme">
        <RadioGroup value={theme} onValueChange={(value) => save('ui.theme', value as UiTheme)} aria-label="Theme" className="gap-0">
          {UI_THEMES.map((id) => (
            <OptionRow
              key={id} id={id} testID={`settings-theme-${id}`} label={THEME_OPTIONS[id].label}
              description={THEME_OPTIONS[id].description} onSelect={() => save('ui.theme', id)}
            />
          ))}
        </RadioGroup>
      </SettingsGroup>

      <SettingsGroup title="Scale" description="Auto follows the window size.">
        <ToggleGroup
          type="single" variant="outline" value={scale} aria-label="Scale" className="flex-wrap justify-start p-3"
          onValueChange={(value) => { if (value) save('ui.scale', value as UiScale); }}
        >
          {UI_SCALES.map((id) => (
            <ToggleGroupItem key={id} value={id} testID={`settings-scale-${id}`} className={cn(scale === id && 'bg-accent')}>
              <Text>{SCALE_LABELS[id]}</Text>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsGroup>

      <SettingsGroup
        title="Fonts"
        description="The typeface the app's text uses on this device. Match theme follows the theme you chose."
      >
        <RadioGroup value={font} onValueChange={(value) => save('ui.font', value)} aria-label="Fonts" className="gap-0">
          {FONT_SETTINGS.map((id) => (
            <OptionRow
              key={id} id={id} testID={`settings-fonts-${id}`} label={FONT_LABELS[id]}
              onSelect={() => save('ui.font', id)}
              right={(
                <Text className="text-lg text-foreground" style={id === 'auto' ? undefined : fontFamilyStyle(TYPE_SETS[id].body, isWeb)}>
                  Aa
                </Text>
              )}
            />
          ))}
        </RadioGroup>
      </SettingsGroup>
    </View>
  );
}
