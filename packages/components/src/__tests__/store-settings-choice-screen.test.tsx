import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StoreSettingsChoiceScreen } from '../layout/store-settings-choice-screen';

const medusaDevChoices = {
  countries: ['dk', 'fr', 'de', 'it', 'es', 'se', 'gb'],
  channels: [{ id: 'k1', name: 'Default Publishable API Key' }],
};

describe('StoreSettingsChoiceScreen', () => {
  it('renders only the sections present in choices', () => {
    render(<StoreSettingsChoiceScreen choices={{ countries: ['de', 'fr'] }} onSubmit={vi.fn()} />);
    expect(screen.getByText('Country')).toBeDefined();
    expect(screen.queryByText('Region')).toBeNull();
    expect(screen.queryByText('Sales channel')).toBeNull();
  });

  it('renders all three sections when all three are present', () => {
    render(
      <StoreSettingsChoiceScreen
        choices={{ regions: [{ id: 'r1', name: 'Europe' }], countries: ['de', 'fr'], channels: [{ id: 'k1', name: 'Default' }] }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('Region')).toBeDefined();
    expect(screen.getByText('Country')).toBeDefined();
    expect(screen.getByText('Sales channel')).toBeDefined();
  });

  it('pre-selects a single-option section', () => {
    render(<StoreSettingsChoiceScreen choices={medusaDevChoices} onSubmit={vi.fn()} />);
    const channelRow = screen.getByRole('radio', { name: 'Default Publishable API Key' });
    expect(channelRow.getAttribute('aria-checked')).toBe('true');
  });

  it('disables submit until every shown section has a selection, and ignores a press while disabled', () => {
    const onSubmit = vi.fn();
    render(<StoreSettingsChoiceScreen choices={medusaDevChoices} onSubmit={onSubmit} />);
    const submit = screen.getByText('Continue');
    expect(submit.closest('[aria-disabled]')?.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the picked country and the pre-selected channel', () => {
    const onSubmit = vi.fn();
    render(<StoreSettingsChoiceScreen choices={medusaDevChoices} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Germany' }));
    const submit = screen.getByText('Continue');
    expect(submit.closest('[aria-disabled]')).toBeNull();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ country: 'de', channel: 'k1' });
  });

  it('pre-selects a matching initial country and ignores one that is not offered', () => {
    const onSubmit = vi.fn();
    const { unmount } = render(
      <StoreSettingsChoiceScreen choices={medusaDevChoices} initial={{ country: 'de' }} onSubmit={onSubmit} />,
    );
    expect(screen.getByRole('radio', { name: 'Germany' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByText('Continue'));
    expect(onSubmit).toHaveBeenCalledWith({ country: 'de', channel: 'k1' });
    unmount();

    render(<StoreSettingsChoiceScreen choices={medusaDevChoices} initial={{ country: 'xx' }} onSubmit={vi.fn()} />);
    for (const radio of screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') !== null && r !== screen.getByRole('radio', { name: 'Default Publishable API Key' }))) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('passes initial.region through when no region section is shown', () => {
    const onSubmit = vi.fn();
    render(
      <StoreSettingsChoiceScreen
        choices={medusaDevChoices}
        initial={{ region: 'reg_stale', country: 'fr' }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByText('Continue'));
    expect(onSubmit).toHaveBeenCalledWith({ region: 'reg_stale', country: 'fr', channel: 'k1' });
  });

  it('defaults country names through Intl.DisplayNames, overridable by countryName', () => {
    render(<StoreSettingsChoiceScreen choices={{ countries: ['de'] }} onSubmit={vi.fn()} />);
    expect(screen.getByText('Germany')).toBeDefined();

    render(<StoreSettingsChoiceScreen choices={{ countries: ['de'] }} countryName={(code) => `Custom ${code}`} onSubmit={vi.fn()} />);
    expect(screen.getByText('Custom de')).toBeDefined();
  });

  it('overrides every default string with its prop', () => {
    render(
      <StoreSettingsChoiceScreen
        choices={{ regions: [{ id: 'r1', name: 'Europe' }], countries: ['de'], channels: [{ id: 'k1', name: 'Default' }] }}
        onSubmit={vi.fn()}
        title="Pick a store"
        body="This till serves more than one place."
        regionLabel="Area"
        countryLabel="Nation"
        channelLabel="Channel"
        submitLabel="Save"
      />,
    );
    expect(screen.getByText('Pick a store')).toBeDefined();
    expect(screen.getByText('This till serves more than one place.')).toBeDefined();
    expect(screen.getByText('Area')).toBeDefined();
    expect(screen.getByText('Nation')).toBeDefined();
    expect(screen.getByText('Channel')).toBeDefined();
    expect(screen.getByText('Save')).toBeDefined();
  });

  it('exposes checked state on every radio row', () => {
    render(<StoreSettingsChoiceScreen choices={{ countries: ['de', 'fr'] }} onSubmit={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(['true', 'false']).toContain(radio.getAttribute('aria-checked'));
    }
    fireEvent.click(screen.getByRole('radio', { name: 'France' }));
    expect(screen.getByRole('radio', { name: 'France' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Germany' }).getAttribute('aria-checked')).toBe('false');
  });
});
