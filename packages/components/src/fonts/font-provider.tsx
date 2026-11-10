// Port of WCPOS v2 packages/core/src/contexts/theme-traits/index.tsx (useThemeType).
import * as React from 'react';
import {
  SYSTEM_TYPE, TYPE_SETS, familiesForType, resolveTypeSet,
  type ThemeFontFamily, type ThemeType, type TypeSetId,
} from '@tallyui/theme';

export type FontStatus = 'loading' | 'loaded' | 'failed';
export interface FontState { setId: TypeSetId; type: ThemeType; status: FontStatus }
export interface FontProviderProps {
  /** The app's stored `ui.font` setting (from `useAppSettings` in `@tallyui/pos`); missing or unknown means Auto. */
  font?: string | null;
  /** The set Auto resolves to. Default `'system'`: TallyUI themes carry no type set. */
  autoTypeSet?: TypeSetId;
  /**
   * Registers the bundled faces of these families, e.g. with expo-font `loadAsync`. The app owns
   * the OFL files. Without a loader the faces are taken as already registered (e.g. web @font-face).
   */
  loadFonts?: (families: ThemeFontFamily[]) => Promise<void>;
  children?: React.ReactNode;
}

const FontContext = React.createContext<FontState>({ setId: 'system', type: SYSTEM_TYPE, status: 'loaded' });

export function FontProvider({ font, autoTypeSet, loadFonts, children }: FontProviderProps): React.JSX.Element {
  const setId = resolveTypeSet(font, autoTypeSet);
  const [loadState, setLoadState] = React.useState<{ setId: TypeSetId; status: FontStatus }>();
  const hasLoader = loadFonts !== undefined;
  const loaderRef = React.useRef(loadFonts);

  React.useLayoutEffect(() => {
    loaderRef.current = loadFonts;
  });

  React.useEffect(() => {
    const loadFonts = loaderRef.current;
    const families = familiesForType(TYPE_SETS[setId]);
    if (!families.length || !loadFonts) return;
    let stale = false;
    loadFonts(families).then(
      () => {
        if (!stale) setLoadState({ setId, status: 'loaded' });
      },
      (error: unknown) => {
        if (stale) return;
        console.warn('Failed to load fonts', error);
        setLoadState({ setId, status: 'failed' });
      },
    );
    return () => { stale = true; };
  }, [setId, hasLoader]);

  const status: FontStatus = !loadFonts || !familiesForType(TYPE_SETS[setId]).length
    ? 'loaded'
    : loadState?.setId === setId ? loadState.status : 'loading';
  const value = React.useMemo<FontState>(() => ({
    setId, status, type: status === 'loaded' ? TYPE_SETS[setId] : SYSTEM_TYPE,
  }), [setId, status]);

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFontType(): FontState {
  return React.useContext(FontContext);
}
