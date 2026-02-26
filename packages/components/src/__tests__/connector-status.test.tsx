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
});
