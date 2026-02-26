import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { SettingsGroup } from '../settings/settings-group';

describe('SettingsGroup', () => {
  it('renders title', () => {
    render(<SettingsGroup title="General"><Text>child</Text></SettingsGroup>);
    expect(screen.getByText('General')).toBeDefined();
  });

  it('renders description', () => {
    render(<SettingsGroup title="General" description="Basic settings"><Text>child</Text></SettingsGroup>);
    expect(screen.getByText('Basic settings')).toBeDefined();
  });

  it('renders children', () => {
    render(<SettingsGroup title="General"><Text>Setting Row</Text></SettingsGroup>);
    expect(screen.getByText('Setting Row')).toBeDefined();
  });
});
