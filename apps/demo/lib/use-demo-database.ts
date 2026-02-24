import { useState, useEffect } from 'react';

import { createTallyDatabase, type TallyDatabase } from '@tallyui/database';
import type { TallyConnector } from '@tallyui/core';

import { wooSampleProducts, medusaSampleProducts } from './sample-data';

/**
 * Hook that creates an in-memory RxDB database for a given connector
 * and seeds it with sample data.
 *
 * This is for the demo only — in a real app you'd sync from the API.
 */
export function useDemoDatabase(connector: TallyConnector) {
  const [db, setDb] = useState<TallyDatabase | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Create the database with in-memory storage (default)
        const database = await createTallyDatabase({
          connector,
          name: `demo_${connector.id}_${Date.now()}`,
        });

        if (cancelled) {
          await database.close();
          return;
        }

        // Seed with sample data based on connector
        const sampleData =
          connector.id === 'woocommerce' ? wooSampleProducts : medusaSampleProducts;

        for (const product of sampleData) {
          await database.products.insert(product);
        }

        // Query all products
        const allProducts = await database.products.find().exec();

        if (!cancelled) {
          setDb(database);
          setProducts(allProducts.map((doc: any) => doc.toJSON()));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [connector]);

  return { db, products, loading, error };
}
