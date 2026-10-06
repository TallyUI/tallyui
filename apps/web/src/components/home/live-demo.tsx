'use client';

import { useState } from 'react';
import { CartPanelDemo } from '@/components/snacks/cart-panel-snack';

export function LiveDemo() {
  const [loaded, setLoaded] = useState(false);

  if (loaded) return <CartPanelDemo />;

  return (
    <div className="rounded-lg border border-fd-border bg-fd-card p-6">
      <p className="font-semibold">Try it live</p>
      <p className="mt-2 text-fd-foreground/80">
        TallyUI&apos;s CartPanel running in Expo Snack. Switch between the WooCommerce and Medusa connectors inside the demo.
      </p>
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className="mt-6 rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground hover:opacity-90"
      >
        Load live demo
      </button>
      <p className="mt-2 text-xs text-fd-foreground/80">Loads from snack.expo.dev.</p>
    </div>
  );
}
