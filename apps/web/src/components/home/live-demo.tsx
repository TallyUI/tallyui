'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { liveDemoEmbed } from '@/lib/live-demo-embed';

const CartPanelDemo = dynamic(
  () => import('@/components/snacks/cart-panel-snack').then((m) => m.CartPanelDemo),
  { ssr: false },
);

export function LiveDemo() {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    // Below 640px the embed scrolls sideways; rtl starts at the right end, where Snack puts the preview.
    // lg:col-span-2 gives the demo the full hero row on desktop.
    return (
      <div className="overflow-x-auto [direction:rtl] lg:col-span-2">
        <CartPanelDemo {...liveDemoEmbed} />
      </div>
    );
  }

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
