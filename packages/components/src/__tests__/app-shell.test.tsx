import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { useRegisterSession } from '@tallyui/pos';
import { AppShell, type ShellNavItem } from '../shell';
import { RegisterBar } from '../register/register-bar';

const dimensions = { width: 1280, height: 800, scale: 1, fontScale: 1 };
// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Pressable: withClass(rn.Pressable), Text: withClass(rn.Text), useWindowDimensions: () => dimensions };
});

const items: ShellNavItem[] = [
  { id: 'pos', label: 'POS', icon: <Text>p</Text> },
  { id: 'orders', label: 'Orders', icon: <Text>o</Text>, badge: 3 },
  { id: 'settings', label: 'Settings', icon: <Text>s</Text>, group: 'bottom' },
];

const register = { session: null, overdue: false, enabled: false, lastClosure: null } as unknown as ReturnType<
  typeof useRegisterSession
>;

function Shell({ onNavigate = vi.fn(), navItems = items }: { onNavigate?: (id: string) => void; navItems?: ShellNavItem[] }) {
  return (
    <AppShell
      navItems={navItems}
      activeId="pos"
      onNavigate={onNavigate}
      registerBar={<RegisterBar register={register} registerId="r" online multiRegister={false} storeName="Main St" onOpenPanel={vi.fn()} />}
    >
      <Text>Page</Text>
    </AppShell>
  );
}

beforeEach(() => Object.assign(dimensions, { width: 1280, height: 800 }));
afterEach(() => cleanup());

it('shows the rail and no menu at 1280x800', () => {
  render(<Shell />);
  expect(screen.getByTestId('nav-rail').tagName).toBe('NAV');
  expect(screen.queryByTestId('register-bar-menu')).toBeNull();
  expect(screen.getByText('Page')).toBeDefined();
});

it.each([
  [360, 640],
  [1024, 400],
])('shows the menu and no rail at %ix%i', (width, height) => {
  Object.assign(dimensions, { width, height });
  render(<Shell />);
  expect(screen.queryByTestId('nav-rail')).toBeNull();
  expect(screen.getByTestId('register-bar-menu')).toBeDefined();
  expect(screen.queryByTestId('nav-drawer')).toBeNull();
});

it('calls onNavigate with the pressed item', () => {
  const onNavigate = vi.fn();
  render(<Shell onNavigate={onNavigate} />);
  fireEvent.click(screen.getByTestId('nav-item-orders'));
  expect(onNavigate).toHaveBeenCalledWith('orders');
});

it('marks only the active item with aria-current', () => {
  render(<Shell />);
  expect(screen.getByTestId('nav-item-pos').getAttribute('aria-current')).toBe('page');
  expect(screen.getByTestId('nav-item-orders').hasAttribute('aria-current')).toBe(false);
  expect(screen.getByTestId('nav-item-orders-badge').textContent).toBe('3');
});

it('opens the drawer from the menu and closes it on Escape', async () => {
  Object.assign(dimensions, { width: 360, height: 640 });
  const onNavigate = vi.fn();
  render(<Shell onNavigate={onNavigate} />);
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  expect(screen.getByTestId('nav-drawer-panel').getAttribute('role')).toBe('dialog');
  expect(screen.getByTestId('nav-drawer').querySelector('nav')).not.toBeNull();
  expect(document.activeElement).toBe(screen.getByTestId('nav-item-pos'));
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  await waitFor(() => expect(screen.queryByTestId('nav-drawer')).toBeNull());
  expect(onNavigate).not.toHaveBeenCalled();
});

it('closes the drawer on backdrop press, and navigates and closes on an item press', async () => {
  Object.assign(dimensions, { width: 360, height: 640 });
  const onNavigate = vi.fn();
  render(<Shell onNavigate={onNavigate} />);
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  fireEvent.click(screen.getByTestId('nav-drawer-backdrop'));
  await waitFor(() => expect(screen.queryByTestId('nav-drawer')).toBeNull());
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  fireEvent.click(screen.getByTestId('nav-item-settings'));
  expect(onNavigate).toHaveBeenCalledWith('settings');
  await waitFor(() => expect(screen.queryByTestId('nav-drawer')).toBeNull());
});

// v2 drawer-content/index.tsx: pressing the focused route dispatches closeDrawer, not navigate.
it('closes the drawer without navigating when the active item is pressed', async () => {
  Object.assign(dimensions, { width: 360, height: 640 });
  const onNavigate = vi.fn();
  render(<Shell onNavigate={onNavigate} />);
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  fireEvent.click(screen.getByTestId('nav-item-pos'));
  await waitFor(() => expect(screen.queryByTestId('nav-drawer')).toBeNull());
  expect(onNavigate).not.toHaveBeenCalled();
});

it('does not reopen the drawer after widening past the boundary and back', async () => {
  Object.assign(dimensions, { width: 360, height: 640 });
  const { rerender } = render(<Shell />);
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  expect(screen.getByTestId('nav-drawer')).toBeDefined();
  Object.assign(dimensions, { width: 1280, height: 800 });
  rerender(<Shell />);
  expect(screen.getByTestId('nav-rail')).toBeDefined();
  Object.assign(dimensions, { width: 360, height: 640 });
  rerender(<Shell />);
  await waitFor(() => expect(screen.queryByTestId('nav-drawer')).toBeNull());
});

it('draws no badge for a count of 0 in the rail or the drawer', () => {
  const zero = items.map((item) => (item.id === 'orders' ? { ...item, badge: 0 } : item));
  const { rerender } = render(<Shell navItems={zero} />);
  expect(screen.getByTestId('nav-item-orders')).toBeDefined();
  expect(screen.queryByTestId('nav-item-orders-badge')).toBeNull();
  Object.assign(dimensions, { width: 360, height: 640 });
  rerender(<Shell navItems={zero} />);
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  expect(screen.getByTestId('nav-item-orders')).toBeDefined();
  expect(screen.queryByTestId('nav-item-orders-badge')).toBeNull();
});

it('keeps Tab inside the open drawer', () => {
  Object.assign(dimensions, { width: 360, height: 640 });
  render(<Shell />);
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  screen.getByTestId('nav-item-settings').focus();
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  });
  expect(document.activeElement).toBe(screen.getByTestId('nav-item-pos'));
});

it('lifts the active rail item onto the rail-selected square and paints the rail on the sidebar wash', () => {
  render(<Shell />);
  const active = screen.getByTestId('nav-item-pos').getAttribute('data-class');
  expect(active).toContain('bg-rail-selected');
  expect(active).not.toContain('bg-primary/10');
  const idle = screen.getByTestId('nav-item-orders').getAttribute('data-class');
  expect(idle).toContain('web:hover:bg-rail-accent');
  expect(idle).not.toContain('bg-rail-selected');
  expect(screen.getByTestId('nav-rail').getAttribute('data-class')).toContain('bg-sidebar');
});

it('paints the drawer panel and its active row like the rail', () => {
  Object.assign(dimensions, { width: 360, height: 640 });
  render(<Shell />);
  fireEvent.click(screen.getByTestId('register-bar-menu'));
  expect(screen.getByTestId('nav-item-pos').getAttribute('data-class')).toContain('bg-rail-selected');
  const label = screen.getByText('POS').getAttribute('data-class');
  expect(label).toContain('text-rail-selected-foreground');
  expect(label).not.toContain('font-semibold');
});
