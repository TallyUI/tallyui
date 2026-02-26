import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { SettingsRow } from '../settings/settings-row';

describe('SettingsRow', () => {
  it('renders label', () => {
    render(<SettingsRow label="Language" />);
    expect(screen.getByText('Language')).toBeDefined();
  });

  it('renders description when provided', () => {
    render(<SettingsRow label="Language" description="Select your preferred language" />);
    expect(screen.getByText('Select your preferred language')).toBeDefined();
  });

  it('renders action slot', () => {
    render(<SettingsRow label="Dark Mode" action={<Text>Toggle</Text>} />);
    expect(screen.getByText('Toggle')).toBeDefined();
  });
});
