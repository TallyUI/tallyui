import { useState } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';
import type { StoreSettingsChoice, StoreSettingsChoices } from '@tallyui/core';

export interface StoreSettingsChoiceScreenProps extends Omit<ViewProps, 'children'> {
  /** From `StoreSettingsError.choices`. Only the sections present are shown. */
  choices: StoreSettingsChoices;
  /** A previous choice to pre-select (for example, a stale stored one); fields that aren't in `choices` are ignored. */
  initial?: StoreSettingsChoice;
  /** Called with the full choice when the user confirms. The app persists it per store and retries `storeSettings`. */
  onSubmit: (choice: StoreSettingsChoice) => void;
  /** Display name for an ISO 3166-1 alpha-2 code. Default: `Intl.DisplayNames` in `locale`, falling back to the upper-cased code. */
  countryName?: (code: string) => string;
  locale?: string;
  title?: string;
  body?: string;
  regionLabel?: string;
  countryLabel?: string;
  channelLabel?: string;
  submitLabel?: string;
  className?: string;
}

type Option = { value: string; label: string };

/** The single option if there is only one, else a matching `initial` value, else none. */
function useSectionSelection(options: Option[], initialValue: string | undefined) {
  const preset = options.length === 1 ? options[0].value : options.find((o) => o.value === initialValue)?.value;
  return useState<string | undefined>(preset);
}

function defaultCountryName(code: string, locale?: string): string {
  try {
    return new Intl.DisplayNames([locale ?? 'en'], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * TV4: shown when `storeSettings` rejects with `choice_required`. The app
 * persists the returned choice per store and calls `storeSettings(context,
 * choice)` again; a stored choice that no longer resolves raises
 * `choice_required` again, and this screen pre-selects what still matches.
 */
export function StoreSettingsChoiceScreen({
  choices,
  initial,
  onSubmit,
  countryName,
  locale,
  title = 'Set up this till',
  body = 'This store sells in more than one place. Choose where this till is.',
  regionLabel = 'Region',
  countryLabel = 'Country',
  channelLabel = 'Sales channel',
  submitLabel = 'Continue',
  className,
  ...viewProps
}: StoreSettingsChoiceScreenProps) {
  const regionOptions: Option[] = (choices.regions ?? []).map((r) => ({ value: r.id, label: r.name }));
  const channelOptions: Option[] = (choices.channels ?? []).map((c) => ({ value: c.id, label: c.name }));
  const nameForCountry = countryName ?? ((code: string) => defaultCountryName(code, locale));
  const countryOptions: Option[] = (choices.countries ?? []).map((code) => ({ value: code, label: nameForCountry(code) }));

  const [region, setRegion] = useSectionSelection(regionOptions, initial?.region);
  const [country, setCountry] = useSectionSelection(countryOptions, initial?.country);
  const [channel, setChannel] = useSectionSelection(channelOptions, initial?.channel);

  const showRegions = regionOptions.length > 0;
  const showCountries = countryOptions.length > 0;
  const showChannels = channelOptions.length > 0;
  const complete =
    (!showRegions || region !== undefined) &&
    (!showCountries || country !== undefined) &&
    (!showChannels || channel !== undefined);

  const handleSubmit = () => {
    if (!complete) return;
    const choice: StoreSettingsChoice = {};
    if (showRegions) choice.region = region;
    else if (initial?.region !== undefined) choice.region = initial.region;
    if (showCountries) choice.country = country?.toLowerCase();
    else if (initial?.country !== undefined) choice.country = initial.country;
    if (showChannels) choice.channel = channel;
    else if (initial?.channel !== undefined) choice.channel = initial.channel;
    onSubmit(choice);
  };

  return (
    <View className={cn('w-full max-w-[560px] flex-1 self-center gap-6 bg-bg p-6', className)} {...viewProps}>
      <View className="gap-2">
        <Text className="text-lg font-bold text-foreground">{title}</Text>
        <Text className="text-sm text-muted-foreground">{body}</Text>
      </View>
      {showRegions && <ChoiceSection label={regionLabel} options={regionOptions} selected={region} onSelect={setRegion} />}
      {showCountries && <ChoiceSection label={countryLabel} options={countryOptions} selected={country} onSelect={setCountry} />}
      {showChannels && <ChoiceSection label={channelLabel} options={channelOptions} selected={channel} onSelect={setChannel} />}
      <Pressable
        onPress={handleSubmit}
        disabled={!complete}
        // Dim the whole button when disabled, so the label keeps its contrast in both themes.
        className={cn('items-center rounded-lg bg-primary px-4 py-3', !complete && 'opacity-50')}
      >
        <Text className="text-sm font-semibold text-primary-foreground">{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

type ChoiceSectionProps = { label: string; options: Option[]; selected: string | undefined; onSelect: (value: string) => void };

function ChoiceSection({ label, options, selected, onSelect }: ChoiceSectionProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold text-muted-foreground">{label}</Text>
      <View className="rounded-lg border border-border">
        {options.map((option, index) => {
          const checked = option.value === selected;
          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              accessibilityRole="radio"
              aria-checked={checked}
              testID={`choice-option-${option.value}`}
              className={cn('flex-row items-center gap-3 px-4 py-3', index > 0 && 'border-t border-border', checked && 'bg-primary/10')}
            >
              {/* Same radio visual as @tallyui/components/ui/radio-group: ring + dot, so the choice reads without colour. */}
              <View className="h-4 w-4 items-center justify-center rounded-full border border-primary">
                {checked && <View testID={`choice-option-${option.value}-dot`} className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </View>
              <Text className={cn('text-sm', checked ? 'font-semibold text-primary' : 'text-foreground')}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
