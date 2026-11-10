import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { appSettingCollection, readAppSettings, useAppSettings, type AppSettingCollection } from '@tallyui/pos';
import { DisplaySettings, type DisplaySettingsProps } from '../settings';

const defaults: DisplaySettingsProps['settings'] = { 'ui.theme': 'system', 'ui.scale': 'auto', 'ui.font': 'auto' };

function setup(settings: Partial<DisplaySettingsProps['settings']> = {}) {
  const setSetting = vi.fn<DisplaySettingsProps['setSetting']>(() => Promise.resolve());
  render(<DisplaySettings settings={{ ...defaults, ...settings }} setSetting={setSetting} />);
  return setSetting;
}

const checked = (testID: string) => screen.getByTestId(testID).getAttribute('aria-checked');
const pressed = (testID: string) => screen.getByTestId(testID).getAttribute('aria-pressed');

afterEach(cleanup);

describe('DisplaySettings', () => {
  it('renders every choice in each section', () => {
    setup();
    for (const label of ['Theme', 'Scale', 'Fonts', 'System', 'Light', 'Dark', 'Follow your device settings']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const label of ['Auto', 'Compact', 'Regular', 'Spacious']) expect(screen.getByText(label)).toBeTruthy();
    for (const label of ['Match theme', 'DM Sans · Instrument Serif', 'Space Grotesk', 'DM Sans · Fraunces', 'Manrope']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(9);
  });

  it('shows the current values as selected', () => {
    setup({ 'ui.theme': 'dark', 'ui.scale': 'compact', 'ui.font': 'grotesk' });
    expect(checked('settings-theme-dark')).toBe('true');
    expect(checked('settings-theme-system')).toBe('false');
    expect(pressed('settings-scale-compact')).toBe('true');
    expect(pressed('settings-scale-auto')).toBe('false');
    expect(checked('settings-fonts-grotesk')).toBe('true');
    expect(checked('settings-fonts-auto')).toBe('false');
  });

  it('shows Auto for a font that is not offered', () => {
    setup({ 'ui.font': 'retired' });
    expect(checked('settings-fonts-auto')).toBe('true');
  });

  it('writes each choice under its key', () => {
    const setSetting = setup();
    fireEvent.click(screen.getByTestId('settings-theme-light'));
    fireEvent.click(screen.getByTestId('settings-scale-spacious'));
    fireEvent.click(screen.getByTestId('settings-fonts-manrope'));
    fireEvent.click(screen.getByText('Dark'));
    expect(setSetting.mock.calls).toEqual([
      ['ui.theme', 'light'], ['ui.scale', 'spacious'], ['ui.font', 'manrope'], ['ui.theme', 'dark'],
    ]);
  });

  it('ignores a second press on the selected scale', () => {
    const setSetting = setup({ 'ui.scale': 'regular' });
    fireEvent.click(screen.getByTestId('settings-scale-regular'));
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('logs a failed write', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setSetting = setup();
    setSetting.mockRejectedValueOnce(new Error('no collection'));
    fireEvent.click(screen.getByTestId('settings-theme-dark'));
    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to save display setting', expect.any(Error)));
    error.mockRestore();
  });

  it('stores the choice through useAppSettings', async () => {
    const db = await createRxDatabase<{ app_settings: AppSettingCollection }>({
      name: `displaysettings${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
      multiInstance: false,
    });
    try {
      await db.addCollections({ app_settings: appSettingCollection() });
      function Wired() {
        return <DisplaySettings {...useAppSettings(db.app_settings)} />;
      }
      render(<Wired />);
      fireEvent.click(screen.getByTestId('settings-scale-compact'));
      await waitFor(() => expect(pressed('settings-scale-compact')).toBe('true'));
      expect((await readAppSettings(db.app_settings))['ui.scale']).toBe('compact');
    } finally {
      cleanup();
      await db.remove();
    }
  });
});
