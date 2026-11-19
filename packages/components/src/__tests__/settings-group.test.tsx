import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { SettingsGroup } from '../settings/settings-group';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute (as printing-settings.test.tsx).
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View) };
});

const card = () => document.querySelector('[data-class~="border-border"]');

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

  it('with no children, draws the header and no card', () => {
    render(<SettingsGroup title="Printers">{null}</SettingsGroup>);
    expect(screen.getByText('Printers')).toBeDefined();
    expect(card()).toBeNull();
  });

  it('with children, draws the card', () => {
    render(<SettingsGroup title="Printers"><Text>row</Text></SettingsGroup>);
    expect(card()).not.toBeNull();
  });
});
