'use client';

import { useState } from 'react';

const schemas = {
  woocommerce: {
    label: 'WooCommerce',
    color: '#96588a',
    product: {
      id: 42,
      name: 'Espresso Machine Pro',
      slug: 'espresso-machine-pro',
      type: 'simple',
      price: '599.99',
      regular_price: '599.99',
      sale_price: '',
      on_sale: false,
      sku: 'ESP-001',
      stock_status: 'instock',
      stock_quantity: 15,
      barcode: '1234567890123',
      images: [{ id: 1, src: 'https://...', alt: '' }],
      categories: [{ id: 1, name: 'Equipment', slug: 'equipment' }],
    },
    traitMapping: {
      'getName(doc)': 'doc.name',
      'getPrice(doc)': 'doc.price',
      'getSku(doc)': 'doc.sku',
      'getImageUrl(doc)': 'doc.images[0].src',
      'getStockStatus(doc)': 'doc.stock_status',
      'getBarcode(doc)': 'doc.barcode',
      'getCategoryNames(doc)': 'doc.categories.map(c => c.name)',
    },
  },
  medusa: {
    label: 'MedusaJS',
    color: '#56B4A9',
    product: {
      id: 'prod_01H...',
      title: 'Commercial Espresso Machine',
      handle: 'commercial-espresso-machine',
      status: 'published',
      thumbnail: 'https://...',
      description: 'High-end commercial espresso machine.',
      categories: [{ id: 'pcat_01', name: 'Equipment' }],
      variants: [
        {
          id: 'var_01H...',
          sku: 'MED-ESP-001',
          barcode: '9876543210001',
          inventory_quantity: 8,
          prices: [{ currency_code: 'usd', amount: 89900 }],
        },
      ],
      images: [{ id: 'img_01', url: 'https://...' }],
    },
    traitMapping: {
      'getName(doc)': 'doc.title',
      'getPrice(doc)': 'doc.variants[0].prices[0].amount / 100',
      'getSku(doc)': 'doc.variants[0].sku',
      'getImageUrl(doc)': 'doc.thumbnail || doc.images[0].url',
      'getStockStatus(doc)': 'derived from variant.inventory_quantity',
      'getBarcode(doc)': 'doc.variants[0].barcode',
      'getCategoryNames(doc)': 'doc.categories.map(c => c.name)',
    },
  },
};

type ConnectorKey = keyof typeof schemas;

export function SchemaComparison() {
  const [active, setActive] = useState<ConnectorKey>('woocommerce');
  const [view, setView] = useState<'schema' | 'traits'>('schema');
  const schema = schemas[active];

  return (
    <div style={{ border: '1px solid var(--fd-border)', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Connector tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--fd-border)', background: 'var(--fd-card)' }}>
        {(Object.keys(schemas) as ConnectorKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              background: active === key ? 'var(--fd-background)' : 'transparent',
              borderBottom: active === key ? `2px solid ${schemas[key].color}` : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: active === key ? 600 : 400,
              fontSize: '14px',
              color: 'var(--fd-foreground)',
            }}
          >
            {schemas[key].label}
          </button>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: '4px', padding: '8px 12px', background: 'var(--fd-card)' }}>
        <button
          onClick={() => setView('schema')}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: 'none',
            background: view === 'schema' ? 'var(--fd-primary)' : 'var(--fd-muted)',
            color: view === 'schema' ? 'var(--fd-primary-foreground)' : 'var(--fd-muted-foreground)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          Raw API Shape
        </button>
        <button
          onClick={() => setView('traits')}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: 'none',
            background: view === 'traits' ? 'var(--fd-primary)' : 'var(--fd-muted)',
            color: view === 'traits' ? 'var(--fd-primary-foreground)' : 'var(--fd-muted-foreground)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          Trait Mapping
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px', maxHeight: '400px', overflow: 'auto' }}>
        {view === 'schema' ? (
          <pre style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
            <code>{JSON.stringify(schema.product, null, 2)}</code>
          </pre>
        ) : (
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--fd-border)', fontWeight: 600 }}>
                  Trait
                </th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--fd-border)', fontWeight: 600 }}>
                  {schema.label} Implementation
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(schema.traitMapping).map(([trait, impl]) => (
                <tr key={trait}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--fd-border)', fontFamily: 'monospace', fontSize: '12px' }}>
                    {trait}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--fd-border)', fontFamily: 'monospace', fontSize: '12px', color: schema.color }}>
                    {impl}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
