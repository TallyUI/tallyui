/**
 * Why `TallyConnector.storeSettings` failed:
 * - `choice_required`: the store has more than one region, country or
 *   channel and none is chosen yet (or the stored choice no longer
 *   resolves); `choices` says what the app can offer;
 * - `failed`: the read could not complete (network error, non-OK response,
 *   a GraphQL/API error).
 */
export type StoreSettingsErrorCode = 'choice_required' | 'failed';

/** What the app can offer the user when `StoreSettingsError.code` is `choice_required`. */
export interface StoreSettingsChoices {
  regions?: Array<{ id: string; name: string }>;
  countries?: string[];
  channels?: Array<{ id: string; name: string }>;
}

/** The rejection from `TallyConnector.storeSettings`; the app picks its message from `code`. */
export class StoreSettingsError extends Error {
  readonly code: StoreSettingsErrorCode;
  readonly choices?: StoreSettingsChoices;

  constructor(code: StoreSettingsErrorCode, message: string, choices?: StoreSettingsChoices) {
    super(message);
    this.name = 'StoreSettingsError';
    this.code = code;
    this.choices = choices;
  }
}
