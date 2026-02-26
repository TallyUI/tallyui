import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Text } from 'react-native';
import { SettingsLayout } from '../layout/settings-layout';

describe('SettingsLayout', () => {
  it('renders both slots in split mode', () => {
    render(
      <SettingsLayout layout="split" navSlot={<Text>Nav Menu</Text>} contentSlot={<Text>Settings Content</Text>} />,
    );
    expect(screen.getByText('Nav Menu')).toBeDefined();
    expect(screen.getByText('Settings Content')).toBeDefined();
  });

  it('renders stacked mode with content visible', () => {
    render(
      <SettingsLayout layout="stacked" navSlot={<Text>Nav</Text>} contentSlot={<Text>Content</Text>} />,
    );
    expect(screen.getByText('Content')).toBeDefined();
  });
});
