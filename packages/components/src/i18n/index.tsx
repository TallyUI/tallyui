/**
 * Port of WCPOS v2 (MIT) `packages/core/src/contexts/translations/index.tsx`: one i18next instance per
 * provider, a locale change applied with `changeLanguage`, v2's init options and `useT`. The regional
 * fallback (`fr_CA` → `fr`) is v2's `rxdb-backend.ts` `getBaseLanguage`, as `fallbackLng`. There is no
 * backend: English is bundled and the app passes other languages as `resources`.
 */
import * as React from 'react';
import { createInstance, type i18n as I18n, type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import en from './locales/en/components.json';

/** Catalogues by language code, as the app spells it (`fr`, `fr_CA`, `fr-CA`): key → string. */
export type Catalogues = Record<string, Record<string, string>>;

export interface I18nProviderProps {
  /** The store's locale (`fr_CA` or `fr-CA`). Without one, the device's locale. */
  locale?: string;
  /** Other languages' catalogues; English is bundled. May arrive or change after mount. */
  resources?: Catalogues;
  children: React.ReactNode;
}

const NS = 'components';

/** `fr_CA` or `fr-CA` → `fr`, then English. */
function fallbackLng(code: string): string[] {
  const parts = code.split(/[-_]/);
  return parts.length > 1 ? [parts[0].toLowerCase(), 'en'] : ['en'];
}

function createI18n(locale: string, resources: Catalogues): I18n {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    fallbackLng,
    load: 'currentOnly',
    ns: [NS],
    defaultNS: NS,
    resources: Object.fromEntries([...Object.entries(resources), ['en', en]].map(([lng, catalogue]) => [lng, { [NS]: catalogue }])),
    keySeparator: false,
    nsSeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
    react: { bindI18nStore: 'added' },
  });
  return instance;
}

const deviceLocale = () => Intl.DateTimeFormat().resolvedOptions().locale;

/** Without a provider, components read this English-only instance. */
const I18nContext = React.createContext<I18n>(createI18n('en', {}));

export function I18nProvider({ locale, resources, children }: I18nProviderProps): React.JSX.Element {
  const lng = React.useMemo(() => locale ?? deviceLocale(), [locale]);
  const [instance] = React.useState(() => createI18n(lng, resources ?? {}));
  const added = React.useRef(resources);

  React.useEffect(() => {
    if (added.current === resources) return;
    added.current = resources;
    for (const [code, catalogue] of Object.entries(resources ?? {})) instance.addResourceBundle(code, NS, catalogue, true, true);
  }, [resources, instance]);

  React.useEffect(() => {
    if (instance.language !== lng) void instance.changeLanguage(lng);
  }, [lng, instance]);

  return <I18nContext.Provider value={instance}>{children}</I18nContext.Provider>;
}

/** The components' `t`, read from the nearest `I18nProvider`, else English. Interpolation is `{name}`. */
export function useT(): TFunction {
  const i18n = React.useContext(I18nContext);
  const options = React.useMemo(() => ({ i18n }), [i18n]);
  return useTranslation(NS, options).t;
}
