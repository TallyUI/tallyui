// Port of WCPOS v2 packages/components/src/lib/fonts.ts and the type sets in lib/themes.ts.
export const THEME_FONT_FAMILIES = {
  dmSans: 'DM Sans',
  instrumentSerif: 'Instrument Serif',
  jetbrainsMono: 'JetBrains Mono',
  spaceGrotesk: 'Space Grotesk',
  fraunces: 'Fraunces',
  manrope: 'Manrope',
} as const;
export type ThemeFontFamily = (typeof THEME_FONT_FAMILIES)[keyof typeof THEME_FONT_FAMILIES];

export interface ThemeFontFace { file: string; weight: number; style?: 'italic' }

/**
 * Faces an app must bundle (Google Fonts, SIL OFL 1.1), with v2's file names.
 * Map each to an app asset, e.g. expo-font:
 * { path: require('./assets/fonts/DMSans-400.ttf'), weight: 400, style, display: 'swap' }.
 */
export const FONT_FACES: Record<ThemeFontFamily, readonly ThemeFontFace[]> = {
  [THEME_FONT_FAMILIES.dmSans]: [
    { file: 'DMSans-400.ttf', weight: 400 },
    { file: 'DMSans-500.ttf', weight: 500 },
    { file: 'DMSans-600.ttf', weight: 600 },
    { file: 'DMSans-700.ttf', weight: 700 },
  ],
  [THEME_FONT_FAMILIES.instrumentSerif]: [
    { file: 'InstrumentSerif-400.ttf', weight: 400 },
    { file: 'InstrumentSerif-400Italic.ttf', weight: 400, style: 'italic' },
  ],
  [THEME_FONT_FAMILIES.jetbrainsMono]: [
    { file: 'JetBrainsMono-400.ttf', weight: 400 },
    { file: 'JetBrainsMono-500.ttf', weight: 500 },
    { file: 'JetBrainsMono-600.ttf', weight: 600 },
  ],
  [THEME_FONT_FAMILIES.spaceGrotesk]: [
    { file: 'SpaceGrotesk-500.ttf', weight: 500 },
    { file: 'SpaceGrotesk-600.ttf', weight: 600 },
    { file: 'SpaceGrotesk-700.ttf', weight: 700 },
  ],
  [THEME_FONT_FAMILIES.fraunces]: [
    { file: 'Fraunces-500.ttf', weight: 500 },
    { file: 'Fraunces-600.ttf', weight: 600 },
    { file: 'Fraunces-500Italic.ttf', weight: 500, style: 'italic' },
    { file: 'Fraunces-600Italic.ttf', weight: 600, style: 'italic' },
  ],
  [THEME_FONT_FAMILIES.manrope]: [
    { file: 'Manrope-500.ttf', weight: 500 },
    { file: 'Manrope-600.ttf', weight: 600 },
    { file: 'Manrope-700.ttf', weight: 700 },
    { file: 'Manrope-800.ttf', weight: 800 },
  ],
};

export type ThemeType = { body?: ThemeFontFamily; num?: ThemeFontFamily; display?: ThemeFontFamily; displayItalic?: boolean };
export const SYSTEM_TYPE: ThemeType = {};
export const TYPE_SETS = {
  system: SYSTEM_TYPE,
  instrument: {
    body: THEME_FONT_FAMILIES.dmSans, num: THEME_FONT_FAMILIES.jetbrainsMono,
    display: THEME_FONT_FAMILIES.instrumentSerif, displayItalic: true,
  },
  grotesk: {
    body: THEME_FONT_FAMILIES.spaceGrotesk, num: THEME_FONT_FAMILIES.spaceGrotesk,
    display: THEME_FONT_FAMILIES.spaceGrotesk,
  },
  fraunces: {
    body: THEME_FONT_FAMILIES.dmSans, num: THEME_FONT_FAMILIES.dmSans,
    display: THEME_FONT_FAMILIES.fraunces, displayItalic: true,
  },
  manrope: {
    body: THEME_FONT_FAMILIES.manrope, num: THEME_FONT_FAMILIES.manrope,
    display: THEME_FONT_FAMILIES.manrope,
  },
} as const satisfies Record<string, ThemeType>;
export type TypeSetId = keyof typeof TYPE_SETS;
export const TYPE_SET_IDS = Object.keys(TYPE_SETS) as TypeSetId[];
export const TYPE_SETTING_AUTO = 'auto';
/** The `ui.font` choices in Settings order. */
export const FONT_SETTINGS: readonly ('auto' | TypeSetId)[] = [TYPE_SETTING_AUTO, ...TYPE_SET_IDS] as const;

export function familiesForType({ body, num, display }: ThemeType): ThemeFontFamily[] {
  return [...new Set([body, num, display].filter((family) => family !== undefined))];
}

/** An explicit set wins; auto, absent and unknown values resolve to `auto`. */
export function resolveTypeSet(value: unknown, auto: TypeSetId = 'system'): TypeSetId {
  return TYPE_SET_IDS.find((id) => id === value) ?? auto;
}

export function fontFamilyStyle(family: ThemeFontFamily | undefined, isWeb: boolean): { fontFamily: string } | undefined {
  if (!family) return undefined;
  if (!isWeb) return { fontFamily: family };
  const fallback = family === THEME_FONT_FAMILIES.instrumentSerif || family === THEME_FONT_FAMILIES.fraunces
    ? 'ui-serif, serif'
    : family === THEME_FONT_FAMILIES.jetbrainsMono
      ? 'ui-monospace, monospace'
      : 'system-ui, sans-serif';
  return { fontFamily: `"${family}", ${fallback}` };
}
