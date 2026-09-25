import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorStatus } from '../settings/connector-status';

describe('ConnectorStatus', () => {
  it('renders connector name', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" />);
    expect(screen.getByText('WooCommerce')).toBeDefined();
  });

  it('renders connected status', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" />);
    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('renders disconnected status', () => {
    render(<ConnectorStatus name="Medusa" status="disconnected" />);
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('renders last sync time', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" lastSync="2 minutes ago" />);
    expect(screen.getByText(/2 minutes ago/)).toBeDefined();
  });

  it('renders error message', () => {
    render(<ConnectorStatus name="WooCommerce" status="error" error="Connection refused" />);
    expect(screen.getByText('Connection refused')).toBeDefined();
  });

  it('renders no unsold line when unsoldCount is undefined', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" />);
    expect(screen.queryByText(/not sold in this channel/)).toBeNull();
  });

  it('renders no unsold line when unsoldCount is 0', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" unsoldCount={0} />);
    expect(screen.queryByText(/not sold in this channel/)).toBeNull();
  });

  it('renders the plural unsold count', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" unsoldCount={54} />);
    expect(screen.getByText('54 products not sold in this channel')).toBeDefined();
  });

  it('renders the singular unsold count', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" unsoldCount={1} />);
    expect(screen.getByText('1 product not sold in this channel')).toBeDefined();
  });

  it('adds the stale suffix when stale', () => {
    render(<ConnectorStatus name="WooCommerce" status="connected" unsoldCount={54} unsoldStale />);
    expect(screen.getByText('54 products not sold in this channel (last check failed)')).toBeDefined();
  });

  it('uses the warning token when current, muted-foreground when stale', () => {
    // react-native-web atomizes className into a hashed class at render time, so the
    // Tailwind class names aren't present on the rendered DOM node (see theme-classes.test.ts
    // for this codebase's convention of asserting class names from source instead).
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../settings/connector-status.tsx'), 'utf8');
    expect(source).toContain("unsoldStale ? 'text-muted-foreground' : 'text-warning'");
  });

  it('lets a custom formatUnsold win', () => {
    render(
      <ConnectorStatus
        name="WooCommerce"
        status="connected"
        unsoldCount={54}
        formatUnsold={(count, stale) => `custom ${count} ${stale}`}
      />,
    );
    expect(screen.getByText('custom 54 false')).toBeDefined();
  });
});
