import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pressable, Text } from 'react-native';
import { SettingsLayout } from '../layout/settings-layout';

const pickNav = ({ closeNav }: { closeNav: () => void }) => (
  <Pressable onPress={closeNav}>
    <Text>General</Text>
  </Pressable>
);

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

  it('stacked, uncontrolled: a pick closes the menu', () => {
    render(<SettingsLayout layout="stacked" navSlot={pickNav} contentSlot={<Text>Content</Text>} />);
    fireEvent.click(screen.getByText('Menu'));
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.queryByText('Content')).toBeNull();
    fireEvent.click(screen.getByText('General'));
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.queryByText('General')).toBeNull();
  });

  it('stacked, controlled: a pick calls onNavOpenChange(false) and the menu follows navOpen', () => {
    const onNavOpenChange = vi.fn();
    const { rerender } = render(
      <SettingsLayout
        layout="stacked"
        navOpen
        onNavOpenChange={onNavOpenChange}
        navSlot={pickNav}
        contentSlot={<Text>Content</Text>}
      />,
    );
    expect(screen.getByText('General')).toBeTruthy();
    fireEvent.click(screen.getByText('General'));
    expect(onNavOpenChange).toHaveBeenCalledTimes(1);
    expect(onNavOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('General')).toBeTruthy();

    rerender(
      <SettingsLayout
        layout="stacked"
        navOpen={false}
        onNavOpenChange={onNavOpenChange}
        navSlot={pickNav}
        contentSlot={<Text>Content</Text>}
      />,
    );
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.queryByText('General')).toBeNull();
    fireEvent.click(screen.getByText('Menu'));
    expect(onNavOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('stacked: Done still closes the menu', () => {
    render(<SettingsLayout layout="stacked" navSlot={<Text>Nav</Text>} contentSlot={<Text>Content</Text>} />);
    fireEvent.click(screen.getByText('Menu'));
    fireEvent.click(screen.getByText('Done'));
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.queryByText('Nav')).toBeNull();
  });

  it('split: a pick and navOpen change nothing', () => {
    const onNavOpenChange = vi.fn();
    render(
      <SettingsLayout
        layout="split"
        navOpen
        onNavOpenChange={onNavOpenChange}
        navSlot={pickNav}
        contentSlot={<Text>Content</Text>}
      />,
    );
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.queryByText('Menu')).toBeNull();
    expect(screen.queryByText('Done')).toBeNull();
    fireEvent.click(screen.getByText('General'));
    expect(onNavOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });
});
