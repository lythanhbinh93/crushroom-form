# Fixture Expected Outputs

Run via `shopify app function run --input tests/fixtures/<name>.json` from the extension dir.

| Fixture | Eligible qty | Tier hit | Expected output |
|---|---|---|---|
| `00-empty-cart.json` | 0 | none | `discounts: []` |
| `01-one-eligible.json` | 1 | none (below min:2) | `discounts: []` |
| `02-two-eligible.json` | 2 | 15% | 1 discount, 2 ProductVariant targets, percentage 15.0, message "Bundle: save 15%" |
| `03-three-eligible.json` | 3 | 25% | 1 discount, 3 ProductVariant targets, percentage 25.0, message "Bundle: save 25%" |
| `04-four-eligible-via-quantity.json` | 4 (single line, qty 4) | 25% | 1 discount, 1 ProductVariant target, percentage 25.0 |
| `05-mixed-eligible-and-ineligible.json` | 2 (third line is untagged) | 15% | 1 discount, **2** ProductVariant targets (only the tagged ones), percentage 15.0, untagged variant absent from targets |
| `06-malformed-metafield.json` | 2 (would qualify) | n/a (parse fail) | `discounts: []` — fail-safe path |
| `07-missing-metafield.json` | 2 (would qualify) | n/a (no config) | `discounts: []` — fail-safe path |

## Critical assertions

1. **Fixtures 06 + 07 must NOT panic** — checkout must continue, discount just absent.
2. **Fixture 05** proves untagged items are excluded from both the count AND the discount targets — non-eligible items pay full price even when bundle is active.
3. **Fixture 04** proves quantity within a single line counts toward tier (qty 4 of one variant → tier 25%).
4. **Fixture 01** proves single-tee carts get nothing (no accidental discount on solo purchases).
