import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Tabs from '../tabs';

describe('Tabs', () => {
  const renderTabs = (props = {}) =>
    render(
      <Tabs.Root value="tab1" onValueChange={vi.fn()} {...props}>
        <Tabs.List testID="list">
          <Tabs.Trigger value="tab1" testID="trigger-1">Tab 1</Tabs.Trigger>
          <Tabs.Trigger value="tab2" testID="trigger-2">Tab 2</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1" testID="content-1">Content 1</Tabs.Content>
        <Tabs.Content value="tab2" testID="content-2">Content 2</Tabs.Content>
      </Tabs.Root>
    );

  it('renders active tab content only', () => {
    renderTabs();
    expect(screen.getByTestId('content-1')).toBeTruthy();
    expect(screen.queryByTestId('content-2')).toBeNull();
  });

  it('calls onValueChange when tab clicked', () => {
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });
    fireEvent.click(screen.getByTestId('trigger-2'));
    expect(onValueChange).toHaveBeenCalledWith('tab2');
  });

  it('list has tablist role', () => {
    renderTabs();
    expect(screen.getByTestId('list').getAttribute('role')).toBe('tablist');
  });

  it('triggers have tab role', () => {
    renderTabs();
    expect(screen.getByTestId('trigger-1').getAttribute('role')).toBe('tab');
    expect(screen.getByTestId('trigger-2').getAttribute('role')).toBe('tab');
  });

  it('active trigger has aria-selected true', () => {
    renderTabs();
    expect(screen.getByTestId('trigger-1').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('trigger-2').getAttribute('aria-selected')).toBe('false');
  });

  it('content has tabpanel role', () => {
    renderTabs();
    expect(screen.getByTestId('content-1').getAttribute('role')).toBe('tabpanel');
  });

  it('supports forceMount on content', () => {
    renderTabs();
    // tab2 content is not rendered by default
    expect(screen.queryByTestId('content-2')).toBeNull();

    // With forceMount, it should render even when not active
    render(
      <Tabs.Root value="tab1" onValueChange={vi.fn()}>
        <Tabs.List><Tabs.Trigger value="tab1">T1</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="tab2" testID="forced" forceMount>Forced</Tabs.Content>
      </Tabs.Root>
    );
    expect(screen.getByTestId('forced')).toBeTruthy();
  });
});
