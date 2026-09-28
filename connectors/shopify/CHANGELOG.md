# @tallyui/connector-shopify

## 2.1.0

### Patch Changes

- [#186](https://github.com/TallyUI/tallyui/pull/186) [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061) Thanks [@kilbot](https://github.com/kilbot)! - Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.

- Updated dependencies [[`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5)]:
  - @tallyui/core@2.1.0

## 2.0.0

### Major Changes

- [#15](https://github.com/TallyUI/tallyui/pull/15) [`807d8da`](https://github.com/TallyUI/tallyui/commit/807d8dafc973fa7d48ca564da0a5d41935b66f8f) Thanks [@kilbot](https://github.com/kilbot)! - Product replication adapters are now pull-only. The `push` handler is removed from `medusaProductReplication`, `wooProductReplication`, `vendureProductReplication` and `shopifyProductReplication`. Catalogue data is server-owned, so the POS never writes products. The old push handlers also turned every HTTP or network error into a fake conflict, which made RxDB silently revert local edits.

  This removes a public member. Nothing in TallyUI called it, but code that called `adapter.push` directly must stop doing so.

### Minor Changes

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99) Thanks [@kilbot](https://github.com/kilbot)! - Add backend-neutral price and stock traits. `ProductTraits` gains `getPrices` (a price list of integer minor-unit `Money` entries, `base` or `sale`, per currency) and `getStock` (`in_stock | out_of_stock | backorder | unknown` plus an optional quantity). Core adds `resolvePrice`, `moneyFromMajor`, `moneyToMajor` and `minorUnitDigits`. Every connector maps its own shape into them; WooCommerce's `instock`/`outofstock`/`onbackorder` strings now stay inside the WooCommerce connector. The string-price and WooCommerce-style stock accessors remain and are deprecated.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4) Thanks [@kilbot](https://github.com/kilbot)! - Add `isSellable` and `getVariantCount` product traits to core and all four connectors.

### Patch Changes

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d) Thanks [@kilbot](https://github.com/kilbot)! - Report product-level stock across all variants, showing the total quantity only when every variant has tracked, known stock.
  Draw the search magnifier with an attached, rounded handle and a larger ring.
- Updated dependencies [[`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5)]:
  - @tallyui/core@2.0.0

## 1.0.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling

### Patch Changes

- Updated dependencies [[`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90)]:
  - @tallyui/core@0.2.0
