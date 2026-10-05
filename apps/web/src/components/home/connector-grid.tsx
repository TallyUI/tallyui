import Link from 'next/link';

const connectors = [
  {
    name: 'WooCommerce',
    pkg: '@tallyui/connector-woocommerce',
    api: 'WooCommerce REST API and the WCPOS API extension.',
    docs: '/docs/connectors#woocommerce',
  },
  {
    name: 'Medusa',
    pkg: '@tallyui/connector-medusa',
    api: 'Medusa v2 through the Admin API.',
    docs: '/docs/connectors#medusajs',
    app: { label: 'Medusa POS', href: 'https://medusapos.com' },
    demo: 'https://demo.medusapos.com/demo',
  },
  {
    name: 'Vendure',
    pkg: '@tallyui/connector-vendure',
    api: 'Vendure through the GraphQL Admin API.',
    docs: '/docs/connectors#vendure',
    app: { label: 'Vendure POS', href: 'https://vendurepos.com' },
    demo: 'https://demo.vendurepos.com/demo',
  },
];

export function ConnectorGrid() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16">
      <h2 className="text-2xl font-semibold tracking-tight">Works with your store</h2>
      <p className="mt-2 text-fd-foreground/80">
        Each backend has its own connector package. Medusa and Vendure each have a full POS app built on TallyUI.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {connectors.map(({ name, pkg, api, docs, app, demo }) => (
          <div key={name} className="flex flex-col rounded-lg border border-fd-border p-4">
            <h3 className="font-semibold">{name}</h3>
            <code className="mt-1 text-sm">{pkg}</code>
            <p className="mt-2 text-sm text-fd-foreground/80">{api}</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
              <Link
                href={docs}
                aria-label={`${name} connector docs`}
                className="underline underline-offset-4"
              >
                Connector docs
              </Link>
              {app && (
                <a href={app.href} className="underline underline-offset-4">
                  {app.label}
                </a>
              )}
              {demo && (
                <a href={demo} aria-label={`${name} live demo`} className="underline underline-offset-4">
                  Live demo
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
