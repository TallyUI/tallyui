import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Platform } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { appSettingCollection, useAppSettings, writeAppSetting, type AppSettingCollection } from '@tallyui/pos';
import { SCALE_VARIABLE_NAMES } from '@tallyui/theme';
import { ScaleProvider, useScale, type ScaleScopeProps } from '../scale';

const dimensions = { width: 1024, height: 768, scale: 1, fontScale: 1 };
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useWindowDimensions: () => dimensions,
}));

const os = Platform.OS;
let db: RxDatabase<{ app_settings: AppSettingCollection }>;

function setPointer(fine: boolean) {
  window.matchMedia = vi.fn((media: string) => ({
    media, matches: fine, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList);
}

function Scope({ variables, children }: ScaleScopeProps) {
  return <div data-testid="scope" data-variables={JSON.stringify(variables)}>{children}</div>;
}

function Probe() {
  return <span>{useScale().step}</span>;
}

function Wired({ collection, children }: { collection: AppSettingCollection; children?: ReactNode }) {
  const { settings } = useAppSettings(collection);
  return <ScaleProvider scale={settings['ui.scale']} scope={Scope}>{children}</ScaleProvider>;
}

beforeEach(async () => {
  Object.assign(dimensions, { width: 1024, height: 768 });
  setPointer(true);
  db = await createRxDatabase({
    name: `scaleprovider${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({ app_settings: appSettingCollection() });
});

afterEach(async () => {
  cleanup();
  Object.assign(Platform, { OS: os });
  for (const name of SCALE_VARIABLE_NAMES) document.documentElement.style.removeProperty(name);
  await db.remove();
});

it('scopes the Regular column for Auto on a 1024-wide web window with no collection', () => {
  render(<ScaleProvider scope={Scope}><Probe /></ScaleProvider>);
  expect(JSON.parse(screen.getByTestId('scope').getAttribute('data-variables')!)).toEqual({
    '--spacing': 4, '--text-base': 14, '--spacing-ctl': 44,
    '--spacing-row': 44, '--spacing-tile': 64, '--radius': 8,
    '--text-amt': 40, '--text-xs': 12, '--text-2xs': 11,
  });
  expect(screen.getByText('regular')).toBeTruthy();
  expect(document.documentElement.style.getPropertyValue('--text-base')).toBe('14px');
});

it('uses the explicit spacious scale on a 1024-wide web window', () => {
  render(<ScaleProvider scale="spacious" scope={Scope}><Probe /></ScaleProvider>);
  expect(screen.getByText('spacious')).toBeTruthy();
  expect(document.documentElement.style.getPropertyValue('--text-base')).toBe('16px');
});

it('follows the stored ui.scale and updates when it changes', async () => {
  await writeAppSetting(db.app_settings, 'ui.scale', 'spacious');
  render(<Wired collection={db.app_settings}><Probe /></Wired>);
  await waitFor(() => {
    expect(JSON.parse(screen.getByTestId('scope').getAttribute('data-variables')!)['--text-base']).toBe(16);
    expect(document.documentElement.style.getPropertyValue('--text-base')).toBe('16px');
  });
  await act(async () => {
    await writeAppSetting(db.app_settings, 'ui.scale', 'compact');
  });
  await waitFor(() => {
    expect(JSON.parse(screen.getByTestId('scope').getAttribute('data-variables')!)).toEqual({
      '--spacing': 3.5, '--text-base': 13, '--spacing-ctl': 40,
      '--spacing-row': 36, '--spacing-tile': 56, '--radius': 6,
      '--text-amt': 34, '--text-xs': 12, '--text-2xs': 11,
    });
    expect(document.documentElement.style.getPropertyValue('--text-base')).toBe('13px');
  });
});

it('floors controls and rows on a coarse pointer', () => {
  setPointer(false);
  dimensions.width = 390;
  render(<ScaleProvider scope={Scope}><Probe /></ScaleProvider>);
  expect(JSON.parse(screen.getByTestId('scope').getAttribute('data-variables')!)).toMatchObject({
    '--spacing-ctl': 44, '--spacing-row': 44,
  });
  expect(screen.getByText('compact')).toBeTruthy();
});

it('reads the shortest side on native and leaves the document root alone', () => {
  Object.assign(Platform, { OS: 'ios' });
  Object.assign(dimensions, { width: 900, height: 400 });
  render(<ScaleProvider scope={Scope}><Probe /></ScaleProvider>);
  expect(screen.getByText('compact')).toBeTruthy();
  expect(JSON.parse(screen.getByTestId('scope').getAttribute('data-variables')!)['--text-base']).toBe(13);
  expect(document.documentElement.style.getPropertyValue('--text-base')).toBe('');
});

it('removes only its nine root properties on unmount', () => {
  const style = document.documentElement.style;
  style.setProperty('--color-primary', 'red');
  const { unmount } = render(<ScaleProvider scope={Scope}><Probe /></ScaleProvider>);
  unmount();
  for (const name of SCALE_VARIABLE_NAMES) expect(style.getPropertyValue(name)).toBe('');
  expect(style.getPropertyValue('--color-primary')).toBe('red');
  style.removeProperty('--color-primary');
});

it('renders its children without a scope', () => {
  render(<ScaleProvider><Probe /></ScaleProvider>);
  expect(screen.getByText('regular')).toBeTruthy();
  expect(screen.queryByTestId('scope')).toBeNull();
});
