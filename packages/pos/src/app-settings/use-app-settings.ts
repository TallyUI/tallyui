import { useEffect, useState } from 'react';
import {
  appSettings$, DEFAULT_APP_SETTINGS, writeAppSetting,
  type AppSettingCollection, type AppSettingKey, type AppSettings,
} from './app-settings';

export function useAppSettings(collection: AppSettingCollection | undefined): {
  settings: AppSettings;
  setSetting: <K extends AppSettingKey>(key: K, value: AppSettings[K]) => Promise<void>;
} {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  useEffect(() => {
    if (!collection) { setSettings(DEFAULT_APP_SETTINGS); return; }
    const subscription = appSettings$(collection).subscribe(setSettings);
    return () => subscription.unsubscribe();
  }, [collection]);

  const setSetting = async <K extends AppSettingKey>(key: K, value: AppSettings[K]): Promise<void> => {
    if (!collection) throw new Error('useAppSettings: setSetting() needs the app settings collection');
    await writeAppSetting(collection, key, value);
  };
  return { settings, setSetting };
}
