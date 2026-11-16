import type { ReactElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { useRegisterSession } from '@tallyui/pos';
import { CameraScanButton } from '../product/camera-scan-button';
import { CategoryNav } from '../product/category-nav';
import { ViewToggle } from '../product/view-toggle';
import { RegisterBar } from '../register/register-bar';
import { MinTargetBand } from '../scale/min-target';
import { ScaleProvider } from '../scale/scale-provider';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Text } from '../ui/text';

const matchMedia = window.matchMedia;

// jsdom has no matchMedia, which usePointer reads as a coarse pointer; this stub is a mouse.
function finePointer() {
  window.matchMedia = vi.fn((media: string) => ({
    media, matches: media === '(pointer: fine)' || media === '(hover: hover)',
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList);
}

afterEach(() => {
  cleanup();
  window.matchMedia = matchMedia;
});

function bandStyle() {
  return (screen.getByTestId('min-target-band').firstElementChild as HTMLElement).style;
}

describe('MinTargetBand', () => {
  it('is 44 tall under a coarse pointer', () => {
    render(<MinTargetBand />);
    expect(bandStyle().minHeight).toBe('44px');
    expect(bandStyle().minWidth).toBe('');
  });

  it('is 44 wide as well when square', () => {
    render(<MinTargetBand square />);
    expect(bandStyle().minHeight).toBe('44px');
    expect(bandStyle().minWidth).toBe('44px');
  });

  it('follows the control token at Spacious', () => {
    render(<ScaleProvider scale="spacious"><MinTargetBand square /></ScaleProvider>);
    expect(bandStyle().minHeight).toBe('52px');
    expect(bandStyle().minWidth).toBe('52px');
  });

  it('renders nothing under a fine pointer', () => {
    finePointer();
    render(<MinTargetBand />);
    expect(screen.queryByTestId('min-target-band')).toBeNull();
  });
});

const register = { session: null, overdue: false, enabled: false, lastClosure: null } as unknown as ReturnType<
  typeof useRegisterSession
>;

const controls: Record<string, { ui: () => ReactElement; bands: number }> = {
  tabs: {
    ui: () => (
      <Tabs value="a" onValueChange={() => {}}>
        <TabsList>
          <TabsTrigger value="a"><Text>A</Text></TabsTrigger>
          <TabsTrigger value="b"><Text>B</Text></TabsTrigger>
        </TabsList>
      </Tabs>
    ),
    bands: 2,
  },
  'category chips': {
    ui: () => <CategoryNav categories={[{ id: '', name: 'All' }, { id: 'c', name: 'Coffee' }]} selectedId="" onSelect={() => {}} />,
    bands: 2,
  },
  'Grid/Table toggle': { ui: () => <ViewToggle value="grid" onChange={() => {}} />, bands: 2 },
  'register bar menu button': {
    ui: () => <RegisterBar register={register} registerId="r" online multiRegister={false} onOpenPanel={() => {}} onOpenMenu={() => {}} />,
    bands: 1,
  },
  'camera scan button': { ui: () => <CameraScanButton open={false} onPress={() => {}} />, bands: 1 },
};

describe.each(Object.entries(controls))('%s', (_name, { ui, bands }) => {
  it('renders a band under a coarse pointer', () => {
    render(ui());
    expect(screen.getAllByTestId('min-target-band')).toHaveLength(bands);
  });

  it('renders none under a fine pointer', () => {
    finePointer();
    render(ui());
    expect(screen.queryAllByTestId('min-target-band')).toHaveLength(0);
  });
});

it('gives vertical category chips no band', () => {
  render(<CategoryNav orientation="vertical" categories={[{ id: '', name: 'All' }]} selectedId="" onSelect={() => {}} />);
  expect(screen.queryAllByTestId('min-target-band')).toHaveLength(0);
});
