# TallyUI programme brief

*Set by Paul Kilmurray, 2026-09-23. This is the standing goal for TallyUI and
the POS products built on it. Decisions taken under it are logged in
[DECISIONS.md](DECISIONS.md); the current plan lives in
[plans/](plans/).*

## The flagship

**WCPOS** (WooCommerce POS) is the flagship: thousands of users, under heavy
development by Paul himself, and therefore a moving target. It is the
reference for what a good point of sale feels like, and the source we port
from.

## The goal

Port the best of WCPOS to other e-commerce platforms as **open-source,
extensible point-of-sale plugins**:

1. **Medusa**
2. **Vendure**
3. **Shopify**, if it proves possible.

The motto is *extensible, open source, integrate with anything*: any payment
terminal, peripheral, receipt printer or barcode scanner, and as many commerce
backends as possible.

## TallyUI's role

TallyUI (this repository) is the shared library every one of those POS
products builds on: common components, POS business logic, the local
database, the sync kit and the connector contract. It stays clean and
platform-agnostic. A platform's POS app, its server plugin and its dev
fixtures live in that platform's own repository and consume TallyUI as a
dependency. The test for whether something belongs here: would a WooCommerce,
Shopify or Vendure POS use it unchanged?

## Sync engine

Each platform needs a sync engine like WCPOS's: offline-capable and complete.
Paul loves the WCPOS engine and it took a long time to get right, so the bar
is high. Medusa and Vendure are Node, so off-the-shelf packages are in play,
with RxDB handling replication and conflict resolution.

## Properties we run

Paul owns **medusapos.com** and **vendurepos.com**. Each serves the marketing
site and a web-app demo for its POS. They are ours to run. Local working
copies: `~/Projects/medusapos` (the Medusa POS product) and
`~/Projects/medusa-dev` (a seeded local Medusa store for development).

## How we work

- Paul gives the rough goal. We research and decide.
- Paul is kept in the loop through the decisions log
  ([DECISIONS.md](DECISIONS.md)), and asked only about important decisions.
- Every decision is backed by numbers and testing: benchmarks, test counts,
  measured behaviour against a real backend, not narrative.
- Work proceeds in small, reviewable pull requests. Specs are written by
  Claude, implementation from a written spec goes to Codex, and nothing
  delegated ships unreviewed.
