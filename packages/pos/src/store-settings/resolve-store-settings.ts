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
  /** A save that throws after a successful resolve: the pick is asked again next launch. */
  onSaveError?: (error: unknown) => void;
}

/**
 * Narrows `tried` to what `choices` actually offers: a field is dropped only when its own list
 * is offered and no longer contains it (a deleted region, say); a field whose list isn't
 * offered passes through unresolved, since only the other parts were ambiguous
 * (`StoreSettingsChoiceScreen`, #96, relies on that to resubmit it unchanged). A deleted region
 * can't loop forever: it's dropped once regions are offered, and otherwise the connector's own
 * default already resolved it.
 */
function narrowInitial(tried: StoreSettingsChoice, choices: StoreSettingsChoices): StoreSettingsChoice | undefined {
  const region = !choices.regions || choices.regions.some((r) => r.id === tried.region) ? tried.region : undefined;
  const country = !choices.countries || (tried.country !== undefined && choices.countries.includes(tried.country)) ? tried.country : undefined;
  const channel = !choices.channels || choices.channels.some((c) => c.id === tried.channel) ? tried.channel : undefined;
  const initial = { ...(region !== undefined && { region }), ...(country !== undefined && { country }), ...(channel !== undefined && { channel }) };
  return Object.keys(initial).length > 0 ? initial : undefined;
}

/**
 * Reads the store settings with the app's choice (TV4). A `choice` argument (a new pick from
 * the choice screen) wins over the stored one and is saved only once it resolves; a stored
 * choice is never re-saved. `choice_required` (including a stale stored choice) gives
 * `choose`, with the tried choice narrowed to what's offered as `initial`, so the screen
 * pre-selects what still matches. Any other error, `failed` included, is rethrown unchanged.
 */
export async function resolveStoreSettings(
  options: ResolveStoreSettingsOptions,
  choice?: StoreSettingsChoice,
): Promise<StoreSettingsResolution> {
  const { connector, context, loadChoice, saveChoice, onSaveError } = options;
  if (!connector.storeSettings) return { status: 'unsupported' };

  // A throw, sync or async, is no stored choice; it never bricks the till.
  const tried = choice ?? (await Promise.resolve().then(loadChoice).catch(() => undefined));
  let settings: StoreSettings;
  try {
    settings = await connector.storeSettings(context, tried);
  } catch (error) {
    if (error instanceof StoreSettingsError && error.code === 'choice_required') {
      const offered = error.choices ?? {};
      const initial = tried && narrowInitial(tried, offered);
      return { status: 'choose', choices: offered, ...(initial && { initial }) };
    }
    throw error;
  }
  // A save that fails doesn't block the till either: the settings already resolved.
  if (choice) await Promise.resolve().then(() => saveChoice(choice)).catch((error) => onSaveError?.(error));
  return { status: 'ready', settings, ...(tried && { choice: tried }) };
}
