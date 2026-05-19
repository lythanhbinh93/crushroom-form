---
phase: 1
title: "Kill Unused Preconnect"
status: pending
priority: P1
effort: "5min"
dependencies: []
---

# Phase 1: Kill Unused Preconnect

## Overview

Lighthouse Network Dependency Tree flagged `https://fonts.shopifycdn.com/` as an unused preconnect. The theme preconnects to this origin on every page but never requests any asset from it. Removing the line frees a connection slot for higher-priority requests (fonts.googleapis.com / fonts.gstatic.com / shop.app / cdn.shopify.com).

Trivial 1-line cut. Zero risk. No measurement gate required.

## Requirements

- **Functional:** Remove the `<link rel="preconnect" href="https://fonts.shopifycdn.com" crossorigin>` line from `layout/theme.liquid`. Preserve the surrounding `{%- unless settings.type_header_font.system? and settings.type_body_font.system? -%}` block IF it still gates something useful; if the block becomes empty, remove the wrapper too.
- **Non-functional:**
  - Single-file edit.
  - Preview-theme push of `layout/theme.liquid` only (`--only` flag).
  - Verify removal via curl with cookie jar (preview theme cookie persistence).

## Architecture

The preconnect lives at `layout/theme.liquid:15`. The wrapping `{%- unless ... -%}` block exists because in legacy Shopify themes, preconnecting to `fonts.shopifycdn.com` is useful when both header AND body fonts are non-system (Shopify-hosted fonts via theme settings). Dopamiles theme overrides this with Google Fonts (Fraunces + Inter Tight + JetBrains Mono) + system-fallback, NOT Shopify-hosted fonts. So the preconnect target is never used.

After removal: HTML emits one fewer `<link rel="preconnect">` tag. Browser opens one fewer TCP/TLS handshake.

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\layout\theme.liquid` (delete lines 14-16, the `{%- unless -%}` ... `{%- endunless -%}` block wrapping the preconnect)
- **No-touch:** Everything else.

## Implementation Steps

1. Read `layout/theme.liquid:13-18` to confirm exact line numbers of the preconnect block.
2. Delete the entire `{%- unless settings.type_header_font.system? and settings.type_body_font.system? -%}` ... `{%- endunless -%}` block (3 lines including the unless/endunless tags and the preconnect itself).
3. Commit on `feat/pdp-perf-pareto`: `perf(theme): kill unused fonts.shopifycdn.com preconnect`.
4. Push to preview theme 158279991548 via `shopify theme push --only=layout/theme.liquid`.
5. Verify via curl with cookie jar that the deployed HTML no longer contains `fonts.shopifycdn.com`.
6. Move to Phase 2. No 5-run baseline measurement required — too trivial to expect a measurable delta.

## Success Criteria

- [ ] `layout/theme.liquid` no longer references `fonts.shopifycdn.com`.
- [ ] Preview theme 158279991548 HTML (verified via curl) no longer emits the preconnect.
- [ ] No Liquid syntax errors (verified by `shopify theme push` succeeding).
- [ ] Commit on `feat/pdp-perf-pareto` with the conventional commit message.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Removing the `{%- unless -%}` block accidentally removes other Liquid logic | Confirm via Read that the block ONLY wraps the preconnect; nothing else inside it |
| Some other theme code DOES use `fonts.shopifycdn.com` (e.g. settings change in future) | If theme settings later switch to Shopify-hosted fonts, the preconnect can be re-added; current state never needs it |
| Push fails authentication | Theme Access token may have been rotated since Round 1; if so, re-issue and set `SHOPIFY_CLI_THEME_TOKEN` before push |
