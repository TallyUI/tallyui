import type { NeutralProduct } from './types';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const CATEGORIES = {
  equipment: { id: 'cat-equipment', name: 'Equipment', slug: 'equipment' },
  beans: { id: 'cat-beans', name: 'Coffee Beans', slug: 'coffee-beans' },
  drinks: { id: 'cat-drinks', name: 'Drinks', slug: 'drinks' },
  drinkware: { id: 'cat-drinkware', name: 'Drinkware', slug: 'drinkware' },
  accessories: { id: 'cat-accessories', name: 'Accessories', slug: 'accessories' },
} as const;

const TAGS = {
  coffee: { id: 'tag-coffee', name: 'Coffee' },
  organic: { id: 'tag-organic', name: 'Organic' },
  singleOrigin: { id: 'tag-single-origin', name: 'Single Origin' },
  fairtrade: { id: 'tag-fairtrade', name: 'Fair Trade' },
  vegan: { id: 'tag-vegan', name: 'Vegan' },
  bestseller: { id: 'tag-bestseller', name: 'Best Seller' },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function img(seed: string, alt: string) {
  return { url: `https://picsum.photos/seed/${seed}/800/800`, alt };
}

// ---------------------------------------------------------------------------
// Equipment (6) — all simple, high-price
// ---------------------------------------------------------------------------

const espressoMachinePro: NeutralProduct = {
  id: 'prod-espresso-machine',
  name: 'Espresso Machine Pro',
  slug: 'espresso-machine-pro',
  description:
    'A professional-grade dual-boiler espresso machine with PID temperature control, pre-infusion, and a 58mm portafilter. Built for shops that take their shots seriously.',
  shortDescription: 'Professional dual-boiler espresso machine.',
  categories: [CATEGORIES.equipment],
  tags: [TAGS.coffee, TAGS.bestseller],
  images: [img('espresso-machine', 'Espresso Machine Pro front view'), img('espresso-machine-side', 'Espresso Machine Pro side view')],
  variants: [
    {
      id: 'var-espresso-machine-default',
      name: 'Default',
      sku: 'EQ-ESP-001',
      barcode: '8901234560001',
      price: 129900,
      compareAtPrice: null,
      weight: 18000,
      stockQuantity: 12,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-01-15T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const burrGrinder: NeutralProduct = {
  id: 'prod-burr-grinder',
  name: 'Burr Grinder',
  slug: 'burr-grinder',
  description:
    'Conical burr grinder with 40 grind settings, from Turkish fine to French press coarse. Low-RPM motor keeps beans cool during grinding.',
  shortDescription: 'Conical burr grinder with 40 settings.',
  categories: [CATEGORIES.equipment],
  tags: [TAGS.coffee],
  images: [img('burr-grinder', 'Burr Grinder')],
  variants: [
    {
      id: 'var-burr-grinder-default',
      name: 'Default',
      sku: 'EQ-GRD-001',
      barcode: '8901234560002',
      price: 24900,
      compareAtPrice: 29900,
      weight: 3200,
      stockQuantity: 30,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-01-20T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const pourOverKettle: NeutralProduct = {
  id: 'prod-pour-over-kettle',
  name: 'Pour-Over Kettle',
  slug: 'pour-over-kettle',
  description:
    'Gooseneck electric kettle with variable temperature control (140-212 F) and a built-in timer. The precision spout gives you full control over pour rate.',
  shortDescription: 'Gooseneck electric kettle with temperature control.',
  categories: [CATEGORIES.equipment],
  tags: [TAGS.coffee],
  images: [img('pour-over-kettle', 'Pour-Over Kettle')],
  variants: [
    {
      id: 'var-pour-over-kettle-default',
      name: 'Default',
      sku: 'EQ-KET-001',
      barcode: '8901234560003',
      price: 7900,
      compareAtPrice: null,
      weight: 900,
      stockQuantity: 45,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-02-01T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const digitalScale: NeutralProduct = {
  id: 'prod-digital-scale',
  name: 'Digital Scale',
  slug: 'digital-scale',
  description:
    'Precision coffee scale with 0.1 g accuracy, built-in timer, and auto-tare. Rechargeable via USB-C.',
  shortDescription: 'Precision 0.1 g coffee scale with timer.',
  categories: [CATEGORIES.equipment],
  tags: [TAGS.coffee],
  images: [img('digital-scale', 'Digital Scale')],
  variants: [
    {
      id: 'var-digital-scale-default',
      name: 'Default',
      sku: 'EQ-SCL-001',
      barcode: '8901234560004',
      price: 3900,
      compareAtPrice: null,
      weight: 350,
      stockQuantity: 60,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-02-05T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const tamper: NeutralProduct = {
  id: 'prod-tamper',
  name: 'Tamper',
  slug: 'tamper',
  description:
    'Calibrated 58mm espresso tamper with a flat stainless-steel base and ergonomic rosewood handle. Clicks at 30 lbs of pressure for consistent pucks.',
  shortDescription: 'Calibrated 58mm espresso tamper.',
  categories: [CATEGORIES.equipment],
  tags: [TAGS.coffee],
  images: [img('tamper', 'Espresso Tamper')],
  variants: [
    {
      id: 'var-tamper-default',
      name: 'Default',
      sku: 'EQ-TMP-001',
      barcode: '8901234560005',
      price: 4500,
      compareAtPrice: null,
      weight: 420,
      stockQuantity: 80,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-02-10T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const knockBox: NeutralProduct = {
  id: 'prod-knock-box',
  name: 'Knock Box',
  slug: 'knock-box',
  description:
    'Heavy-duty stainless-steel knock box with a shock-absorbent bar and non-slip rubber base. Fits neatly beside your espresso machine.',
  shortDescription: 'Stainless-steel espresso knock box.',
  categories: [CATEGORIES.equipment],
  tags: [TAGS.coffee],
  images: [img('knock-box', 'Knock Box')],
  variants: [
    {
      id: 'var-knock-box-default',
      name: 'Default',
      sku: 'EQ-KNK-001',
      barcode: '8901234560006',
      price: 3500,
      compareAtPrice: null,
      weight: 680,
      stockQuantity: 55,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-02-15T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Coffee Beans (8) — all variable (250g / 500g / 1kg), some on sale
// ---------------------------------------------------------------------------

function beanVariants(
  prefix: string,
  base250: number,
  opts?: { sale250?: number; sale500?: number; sale1kg?: number },
): NeutralProduct['variants'] {
  const base500 = Math.round(base250 * 1.85);
  const base1kg = Math.round(base250 * 3.4);
  return [
    {
      id: `var-${prefix}-250`,
      name: '250 g',
      sku: `BN-${prefix.toUpperCase()}-250`,
      barcode: null,
      price: base250,
      compareAtPrice: opts?.sale250 ?? null,
      weight: 250,
      stockQuantity: 120,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '250 g' },
    },
    {
      id: `var-${prefix}-500`,
      name: '500 g',
      sku: `BN-${prefix.toUpperCase()}-500`,
      barcode: null,
      price: base500,
      compareAtPrice: opts?.sale500 ?? null,
      weight: 500,
      stockQuantity: 80,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '500 g' },
    },
    {
      id: `var-${prefix}-1kg`,
      name: '1 kg',
      sku: `BN-${prefix.toUpperCase()}-1KG`,
      barcode: null,
      price: base1kg,
      compareAtPrice: opts?.sale1kg ?? null,
      weight: 1000,
      stockQuantity: 40,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '1 kg' },
    },
  ];
}

const ethiopianYirgacheffe: NeutralProduct = {
  id: 'prod-ethiopian-yirgacheffe',
  name: 'Ethiopian Yirgacheffe',
  slug: 'ethiopian-yirgacheffe',
  description:
    'Bright and complex with blueberry, lemon zest, and jasmine notes. Washed process, light roast. Grown at 1,800-2,200 m elevation in the Gedeo zone.',
  shortDescription: 'Light roast, blueberry and jasmine notes.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee, TAGS.singleOrigin, TAGS.organic],
  images: [img('ethiopian-yirgacheffe', 'Ethiopian Yirgacheffe beans')],
  variants: beanVariants('eth', 1800, { sale250: 2100, sale500: 3900, sale1kg: 7100 }),
  type: 'variable',
  createdAt: '2025-03-01T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const colombianSupremo: NeutralProduct = {
  id: 'prod-colombian-supremo',
  name: 'Colombian Supremo',
  slug: 'colombian-supremo',
  description:
    'A classic medium roast with caramel sweetness, walnut, and a smooth chocolate finish. Screen 17+ beans from the Huila region.',
  shortDescription: 'Medium roast, caramel and chocolate notes.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee, TAGS.singleOrigin, TAGS.fairtrade],
  images: [img('colombian-supremo', 'Colombian Supremo beans')],
  variants: beanVariants('col', 1600),
  type: 'variable',
  createdAt: '2025-03-05T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const brazilianSantos: NeutralProduct = {
  id: 'prod-brazilian-santos',
  name: 'Brazilian Santos',
  slug: 'brazilian-santos',
  description:
    'Low-acid, full-bodied medium roast with peanut, milk chocolate, and a hint of dried fruit. Natural process from the Cerrado region.',
  shortDescription: 'Medium roast, nutty and smooth.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee, TAGS.singleOrigin],
  images: [img('brazilian-santos', 'Brazilian Santos beans')],
  variants: beanVariants('bra', 1500, { sale250: 1800 }),
  type: 'variable',
  createdAt: '2025-03-10T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const guatemalanAntigua: NeutralProduct = {
  id: 'prod-guatemalan-antigua',
  name: 'Guatemalan Antigua',
  slug: 'guatemalan-antigua',
  description:
    'Rich and velvety dark roast with cocoa, brown sugar, and a mild spice finish. Shade-grown at volcanic elevations near Antigua.',
  shortDescription: 'Dark roast, cocoa and brown sugar.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee, TAGS.singleOrigin, TAGS.fairtrade],
  images: [img('guatemalan-antigua', 'Guatemalan Antigua beans')],
  variants: beanVariants('gua', 1900),
  type: 'variable',
  createdAt: '2025-03-15T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const sumatraMandheling: NeutralProduct = {
  id: 'prod-sumatra-mandheling',
  name: 'Sumatra Mandheling',
  slug: 'sumatra-mandheling',
  description:
    'Heavy-bodied dark roast with earthy, herbal, and tobacco notes. Wet-hulled process from the Lintong highlands of North Sumatra.',
  shortDescription: 'Dark roast, earthy and herbal.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee, TAGS.singleOrigin],
  images: [img('sumatra-mandheling', 'Sumatra Mandheling beans')],
  variants: beanVariants('sum', 1700),
  type: 'variable',
  createdAt: '2025-03-20T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const kenyaAA: NeutralProduct = {
  id: 'prod-kenya-aa',
  name: 'Kenya AA',
  slug: 'kenya-aa',
  description:
    'Vivid medium-light roast with blackcurrant, grapefruit, and a sparkling tomato-like acidity. AA-grade beans from the slopes of Mt. Kenya.',
  shortDescription: 'Medium-light roast, bright and fruity.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee, TAGS.singleOrigin, TAGS.organic],
  images: [img('kenya-aa', 'Kenya AA beans')],
  variants: beanVariants('ken', 2100, { sale250: 2500, sale500: 4600 }),
  type: 'variable',
  createdAt: '2025-03-25T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const houseBlend: NeutralProduct = {
  id: 'prod-house-blend',
  name: 'House Blend',
  slug: 'house-blend',
  description:
    'Our daily driver. A medium roast blending Brazilian, Colombian, and Ethiopian beans for a balanced cup with chocolate, citrus, and a clean finish.',
  shortDescription: 'Balanced medium roast house blend.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee, TAGS.bestseller],
  images: [img('house-blend', 'House Blend beans')],
  variants: beanVariants('hbl', 1400),
  type: 'variable',
  createdAt: '2025-04-01T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const decafBlend: NeutralProduct = {
  id: 'prod-decaf-blend',
  name: 'Decaf Blend',
  slug: 'decaf-blend',
  description:
    'Swiss Water Process decaf that still tastes like real coffee. Medium roast with milk chocolate and hazelnut. 99.9% caffeine-free.',
  shortDescription: 'Swiss Water Process decaf, medium roast.',
  categories: [CATEGORIES.beans],
  tags: [TAGS.coffee],
  images: [img('decaf-blend', 'Decaf Blend beans')],
  variants: beanVariants('dcf', 1600),
  type: 'variable',
  createdAt: '2025-04-05T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Drinks (6) — simple, low-price (350-699 cents), at least 1 with no images
// ---------------------------------------------------------------------------

const espressoShot: NeutralProduct = {
  id: 'prod-espresso-shot',
  name: 'Espresso Shot',
  slug: 'espresso-shot',
  description:
    'A double shot pulled from our house blend. Rich crema, balanced body, and a clean finish.',
  shortDescription: 'Double espresso shot.',
  categories: [CATEGORIES.drinks],
  tags: [TAGS.coffee, TAGS.bestseller],
  images: [img('espresso-shot', 'Espresso Shot')],
  variants: [
    {
      id: 'var-espresso-shot-default',
      name: 'Default',
      sku: 'DRK-ESP-001',
      barcode: null,
      price: 350,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-04-10T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const latte: NeutralProduct = {
  id: 'prod-latte',
  name: 'Latte',
  slug: 'latte',
  description:
    'Creamy steamed milk over a double shot of espresso, topped with a thin layer of microfoam.',
  shortDescription: 'Classic espresso latte.',
  categories: [CATEGORIES.drinks],
  tags: [TAGS.coffee, TAGS.bestseller],
  images: [img('latte', 'Latte')],
  variants: [
    {
      id: 'var-latte-default',
      name: 'Default',
      sku: 'DRK-LAT-001',
      barcode: null,
      price: 550,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-04-12T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const cappuccino: NeutralProduct = {
  id: 'prod-cappuccino',
  name: 'Cappuccino',
  slug: 'cappuccino',
  description:
    'Equal parts espresso, steamed milk, and thick foam. Dusted with cocoa powder.',
  shortDescription: 'Classic cappuccino with cocoa dusting.',
  categories: [CATEGORIES.drinks],
  tags: [TAGS.coffee],
  images: [img('cappuccino', 'Cappuccino')],
  variants: [
    {
      id: 'var-cappuccino-default',
      name: 'Default',
      sku: 'DRK-CAP-001',
      barcode: null,
      price: 550,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-04-14T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const coldBrew: NeutralProduct = {
  id: 'prod-cold-brew',
  name: 'Cold Brew',
  slug: 'cold-brew',
  description:
    'Slow-steeped for 18 hours using our house blend. Smooth, low-acid, and naturally sweet. Served over ice.',
  shortDescription: '18-hour cold brew, served over ice.',
  categories: [CATEGORIES.drinks],
  tags: [TAGS.coffee, TAGS.vegan],
  images: [], // intentional: no images
  variants: [
    {
      id: 'var-cold-brew-default',
      name: 'Default',
      sku: 'DRK-CLD-001',
      barcode: null,
      price: 499,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-04-16T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const matchaLatte: NeutralProduct = {
  id: 'prod-matcha-latte',
  name: 'Matcha Latte',
  slug: 'matcha-latte',
  description:
    'Ceremonial-grade matcha whisked with steamed oat milk. Earthy, smooth, and subtly sweet.',
  shortDescription: 'Ceremonial-grade matcha with oat milk.',
  categories: [CATEGORIES.drinks],
  tags: [TAGS.vegan, TAGS.organic],
  images: [img('matcha-latte', 'Matcha Latte')],
  variants: [
    {
      id: 'var-matcha-latte-default',
      name: 'Default',
      sku: 'DRK-MAT-001',
      barcode: null,
      price: 599,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-04-18T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const chaiLatte: NeutralProduct = {
  id: 'prod-chai-latte',
  name: 'Chai Latte',
  slug: 'chai-latte',
  description:
    'House-made masala chai concentrate with steamed milk. Warming spices — cardamom, cinnamon, ginger, clove — and black tea.',
  shortDescription: 'Spiced masala chai with steamed milk.',
  categories: [CATEGORIES.drinks],
  tags: [TAGS.vegan],
  images: [img('chai-latte', 'Chai Latte')],
  variants: [
    {
      id: 'var-chai-latte-default',
      name: 'Default',
      sku: 'DRK-CHI-001',
      barcode: null,
      price: 599,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-04-20T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Drinkware (5) — variable (size/color), multiple images
// ---------------------------------------------------------------------------

const ceramicMugSet: NeutralProduct = {
  id: 'prod-ceramic-mug-set',
  name: 'Ceramic Mug Set',
  slug: 'ceramic-mug-set',
  description:
    'Set of four handmade stoneware mugs, each 12 oz. Microwave and dishwasher safe. Available in Matte White and Charcoal.',
  shortDescription: 'Set of 4 handmade stoneware mugs.',
  categories: [CATEGORIES.drinkware],
  tags: [TAGS.bestseller],
  images: [
    img('ceramic-mug-white', 'Ceramic Mug Set — Matte White'),
    img('ceramic-mug-charcoal', 'Ceramic Mug Set — Charcoal'),
    img('ceramic-mug-detail', 'Ceramic Mug Set — close-up of glaze'),
  ],
  variants: [
    {
      id: 'var-ceramic-mug-white',
      name: 'Matte White',
      sku: 'DW-MUG-WHT',
      barcode: '8901234560020',
      price: 4200,
      compareAtPrice: null,
      weight: 1600,
      stockQuantity: 25,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Color: 'Matte White' },
    },
    {
      id: 'var-ceramic-mug-charcoal',
      name: 'Charcoal',
      sku: 'DW-MUG-CHR',
      barcode: '8901234560021',
      price: 4200,
      compareAtPrice: null,
      weight: 1600,
      stockQuantity: 18,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Color: 'Charcoal' },
    },
  ],
  type: 'variable',
  createdAt: '2025-05-01T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const travelTumbler: NeutralProduct = {
  id: 'prod-travel-tumbler',
  name: 'Travel Tumbler',
  slug: 'travel-tumbler',
  description:
    'Double-wall vacuum-insulated tumbler. Keeps drinks hot for 6 hours or cold for 12. Leak-proof flip lid.',
  shortDescription: 'Vacuum-insulated travel tumbler.',
  categories: [CATEGORIES.drinkware],
  tags: [],
  images: [
    img('travel-tumbler-black', 'Travel Tumbler — Black'),
    img('travel-tumbler-sage', 'Travel Tumbler — Sage'),
  ],
  variants: [
    {
      id: 'var-tumbler-sm-black',
      name: '12 oz / Black',
      sku: 'DW-TBL-12-BLK',
      barcode: '8901234560030',
      price: 2800,
      compareAtPrice: null,
      weight: 340,
      stockQuantity: 40,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '12 oz', Color: 'Black' },
    },
    {
      id: 'var-tumbler-sm-sage',
      name: '12 oz / Sage',
      sku: 'DW-TBL-12-SAG',
      barcode: '8901234560031',
      price: 2800,
      compareAtPrice: null,
      weight: 340,
      stockQuantity: 35,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '12 oz', Color: 'Sage' },
    },
    {
      id: 'var-tumbler-lg-black',
      name: '16 oz / Black',
      sku: 'DW-TBL-16-BLK',
      barcode: '8901234560032',
      price: 3400,
      compareAtPrice: null,
      weight: 420,
      stockQuantity: 28,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '16 oz', Color: 'Black' },
    },
    {
      id: 'var-tumbler-lg-sage',
      name: '16 oz / Sage',
      sku: 'DW-TBL-16-SAG',
      barcode: '8901234560033',
      price: 3400,
      compareAtPrice: null,
      weight: 420,
      stockQuantity: 22,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '16 oz', Color: 'Sage' },
    },
  ],
  type: 'variable',
  createdAt: '2025-05-05T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const pourOverCarafe: NeutralProduct = {
  id: 'prod-pour-over-carafe',
  name: 'Pour-Over Carafe',
  slug: 'pour-over-carafe',
  description:
    'Borosilicate glass carafe with a removable stainless-steel dripper. Brews 2-4 cups. Heat-resistant cork collar.',
  shortDescription: 'Glass pour-over carafe with steel dripper.',
  categories: [CATEGORIES.drinkware],
  tags: [TAGS.coffee],
  images: [
    img('pour-over-carafe', 'Pour-Over Carafe'),
    img('pour-over-carafe-top', 'Pour-Over Carafe — top view with dripper'),
  ],
  variants: [
    {
      id: 'var-carafe-sm',
      name: '400 ml',
      sku: 'DW-CRF-400',
      barcode: '8901234560040',
      price: 3200,
      compareAtPrice: null,
      weight: 480,
      stockQuantity: 20,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '400 ml' },
    },
    {
      id: 'var-carafe-lg',
      name: '800 ml',
      sku: 'DW-CRF-800',
      barcode: '8901234560041',
      price: 3900,
      compareAtPrice: null,
      weight: 680,
      stockQuantity: 15,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Size: '800 ml' },
    },
  ],
  type: 'variable',
  createdAt: '2025-05-10T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const glassEspressoCup: NeutralProduct = {
  id: 'prod-glass-espresso-cup',
  name: 'Glass Espresso Cup',
  slug: 'glass-espresso-cup',
  description:
    'Double-wall borosilicate glass espresso cup. 3 oz capacity. Shows off the layers of your shot. Sold individually.',
  shortDescription: 'Double-wall glass espresso cup, 3 oz.',
  categories: [CATEGORIES.drinkware],
  tags: [TAGS.coffee],
  images: [
    img('glass-espresso-cup', 'Glass Espresso Cup'),
    img('glass-espresso-cup-pair', 'Glass Espresso Cup — pair on saucer'),
  ],
  variants: [
    {
      id: 'var-glass-espresso-single',
      name: 'Single',
      sku: 'DW-GEC-001',
      barcode: '8901234560050',
      price: 1200,
      compareAtPrice: null,
      weight: 120,
      stockQuantity: 60,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Quantity: 'Single' },
    },
    {
      id: 'var-glass-espresso-set4',
      name: 'Set of 4',
      sku: 'DW-GEC-004',
      barcode: '8901234560051',
      price: 3900,
      compareAtPrice: 4800,
      weight: 480,
      stockQuantity: 30,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Quantity: 'Set of 4' },
    },
  ],
  type: 'variable',
  createdAt: '2025-05-12T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const insulatedFlask: NeutralProduct = {
  id: 'prod-insulated-flask',
  name: 'Insulated Flask',
  slug: 'insulated-flask',
  description:
    'Triple-wall stainless-steel flask that keeps coffee piping hot for 12 hours. Wide mouth for easy cleaning. BPA-free.',
  shortDescription: 'Triple-wall stainless-steel flask.',
  categories: [CATEGORIES.drinkware],
  tags: [],
  images: [
    img('insulated-flask-midnight', 'Insulated Flask — Midnight Blue'),
    img('insulated-flask-copper', 'Insulated Flask — Copper'),
  ],
  variants: [
    {
      id: 'var-flask-midnight',
      name: 'Midnight Blue',
      sku: 'DW-FLK-MID',
      barcode: '8901234560060',
      price: 3600,
      compareAtPrice: null,
      weight: 360,
      stockQuantity: 33,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Color: 'Midnight Blue' },
    },
    {
      id: 'var-flask-copper',
      name: 'Copper',
      sku: 'DW-FLK-COP',
      barcode: '8901234560061',
      price: 3600,
      compareAtPrice: null,
      weight: 360,
      stockQuantity: 27,
      stockStatus: 'instock',
      trackInventory: true,
      options: { Color: 'Copper' },
    },
  ],
  type: 'variable',
  createdAt: '2025-05-15T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Accessories (5)
// ---------------------------------------------------------------------------

const paperFilters: NeutralProduct = {
  id: 'prod-paper-filters',
  name: 'Paper Filters',
  slug: 'paper-filters',
  description:
    'Pack of 100 unbleached paper filters for pour-over and drip brewers. Fits standard #4 cones.',
  shortDescription: '100-pack unbleached paper filters.',
  categories: [CATEGORIES.accessories],
  tags: [TAGS.coffee],
  images: [img('paper-filters', 'Paper Filters')],
  variants: [
    {
      id: 'var-paper-filters-default',
      name: 'Default',
      sku: 'AC-FLT-001',
      barcode: '8901234560070',
      price: 800,
      compareAtPrice: null,
      weight: 200,
      stockQuantity: 200,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-05-20T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const cleaningKit: NeutralProduct = {
  id: 'prod-cleaning-kit',
  name: 'Cleaning Kit',
  slug: 'cleaning-kit',
  description:
    'Everything you need to keep your machine spotless: group-head brush, backflush detergent (40 doses), microfiber cloths, and a blind basket.',
  shortDescription: 'Espresso machine cleaning kit.',
  categories: [CATEGORIES.accessories],
  tags: [TAGS.coffee],
  images: [img('cleaning-kit', 'Cleaning Kit')],
  variants: [
    {
      id: 'var-cleaning-kit-default',
      name: 'Default',
      sku: 'AC-CLN-001',
      barcode: '8901234560071',
      price: 2400,
      compareAtPrice: null,
      weight: 450,
      stockQuantity: 50,
      stockStatus: 'instock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-05-22T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const coffeeGiftCard: NeutralProduct = {
  id: 'prod-coffee-gift-card',
  name: 'Coffee Gift Card',
  slug: 'coffee-gift-card',
  description:
    'Give the gift of great coffee. Digital gift card redeemable in-store and online. Available in $25, $50, and $100 denominations.',
  shortDescription: 'Digital coffee gift card.',
  categories: [CATEGORIES.accessories],
  tags: [],
  images: [img('gift-card', 'Coffee Gift Card')],
  variants: [
    {
      id: 'var-gift-card-25',
      name: '$25',
      sku: 'AC-GFT-025',
      barcode: null,
      price: 2500,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: { Denomination: '$25' },
    },
    {
      id: 'var-gift-card-50',
      name: '$50',
      sku: 'AC-GFT-050',
      barcode: null,
      price: 5000,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: { Denomination: '$50' },
    },
    {
      id: 'var-gift-card-100',
      name: '$100',
      sku: 'AC-GFT-100',
      barcode: null,
      price: 10000,
      compareAtPrice: null,
      weight: null,
      stockQuantity: 999,
      stockStatus: 'instock',
      trackInventory: false,
      options: { Denomination: '$100' },
    },
  ],
  type: 'giftcard',
  createdAt: '2025-05-24T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const milkFrother: NeutralProduct = {
  id: 'prod-milk-frother',
  name: 'Milk Frother',
  slug: 'milk-frother',
  description:
    'Handheld electric milk frother with a stainless-steel whisk. Battery-powered, froths in 15 seconds.',
  shortDescription: 'Handheld electric milk frother.',
  categories: [CATEGORIES.accessories],
  tags: [TAGS.coffee],
  images: [img('milk-frother', 'Milk Frother')],
  variants: [
    {
      id: 'var-milk-frother-default',
      name: 'Default',
      sku: 'AC-FRT-001',
      barcode: '8901234560073',
      price: 1900,
      compareAtPrice: null,
      weight: 180,
      stockQuantity: 0,
      stockStatus: 'outofstock',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-05-26T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

const reusableFilter: NeutralProduct = {
  id: 'prod-reusable-filter',
  name: 'Reusable Filter',
  slug: 'reusable-filter',
  description:
    'Fine-mesh stainless-steel pour-over filter. Eliminates paper waste and lets more oils through for a fuller-bodied cup. Fits standard #4 cones.',
  shortDescription: 'Stainless-steel reusable pour-over filter.',
  categories: [CATEGORIES.accessories],
  tags: [TAGS.coffee, TAGS.vegan],
  images: [img('reusable-filter', 'Reusable Filter')],
  variants: [
    {
      id: 'var-reusable-filter-default',
      name: 'Default',
      sku: 'AC-RFL-001',
      barcode: '8901234560074',
      price: 1400,
      compareAtPrice: null,
      weight: 80,
      stockQuantity: 5,
      stockStatus: 'onbackorder',
      trackInventory: true,
      options: {},
    },
  ],
  type: 'simple',
  createdAt: '2025-05-28T08:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const products: NeutralProduct[] = [
  // Equipment (6)
  espressoMachinePro,
  burrGrinder,
  pourOverKettle,
  digitalScale,
  tamper,
  knockBox,
  // Coffee Beans (8)
  ethiopianYirgacheffe,
  colombianSupremo,
  brazilianSantos,
  guatemalanAntigua,
  sumatraMandheling,
  kenyaAA,
  houseBlend,
  decafBlend,
  // Drinks (6)
  espressoShot,
  latte,
  cappuccino,
  coldBrew,
  matchaLatte,
  chaiLatte,
  // Drinkware (5)
  ceramicMugSet,
  travelTumbler,
  pourOverCarafe,
  glassEspressoCup,
  insulatedFlask,
  // Accessories (5)
  paperFilters,
  cleaningKit,
  coffeeGiftCard,
  milkFrother,
  reusableFilter,
];
