import { StoreSettingsError } from '@tallyui/core';
import type { StoreSettings, StoreSettingsChoice, StoreSettingsChoices, SyncContext, TallyConnector } from '@tallyui/core';

export type StoreSettingsResolution =
  | { status: 'ready'; settings: StoreSettings; choice?: StoreSettingsChoice }
  | { status: 'choose'; choices: StoreSettingsChoices; initial?: StoreSettingsChoice }
  | { status: 'unsupported' }; // the connector has no storeSettings: the app uses its own configuration

export interface ResolveStoreSettingsOptions {
  connector: TallyConnector;
  context: SyncContext;
  /** The app's stored choice for this store (its own settings; TallyUI never stores it). */
  loadChoice: () => StoreSettingsChoice | undefined | Promise<StoreSettingsChoice | undefined>;
  saveChoice: (choice: StoreSettingsChoice) => void | Promise<void>;
}

/**
 * Reads the store settings with the app's choice (TV4). A `choice` argument (a new pick from
 * the choice screen) wins over the stored one and is saved only once it resolves; a stored
 * choice is never re-saved. `choice_required` (including a stale stored choice) gives
 * `choose`, with the tried choice as `initial` so the screen pre-selects what still matches.
 * Any other error, `failed` included, is rethrown unchanged.
 */
export async function resolveStoreSettings(
  options: ResolveStoreSettingsOptions,
  choice?: StoreSettingsChoice,
): Promise<StoreSettingsResolution> {
  const { connector, context, loadChoice, saveChoice } = options;
  if (!connector.storeSettings) return { status: 'unsupported' };

  const tried = choice ?? (await loadChoice());
  let settings: StoreSettings;
  try {
    settings = await connector.storeSettings(context, tried);
  } catch (error) {
    if (error instanceof StoreSettingsError && error.code === 'choice_required') {
      return { status: 'choose', choices: error.choices ?? {}, ...(tried && { initial: tried }) };
    }
    throw error;
  }
  if (choice) await saveChoice(choice);
  return { status: 'ready', settings, ...(tried && { choice: tried }) };
}
