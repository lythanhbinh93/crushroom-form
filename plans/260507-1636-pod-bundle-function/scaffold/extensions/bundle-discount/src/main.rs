// Bundle Discount Function — POD quantity-tier discount.
//
// Reads tier config from shop.metafield.bundles.tiers (JSON array of {min, pct}).
// Counts cart lines whose product is tagged "bundle-eligible".
// Applies highest matching tier's percentage off the eligible variants.
//
// Fail-safe: any parse error or missing config returns no discount (never panics
// at checkout). Tag is hardcoded in input.graphql at build time — change the tag
// requires redeploy. Tier values are runtime-configurable via metafield.

use shopify_function::prelude::*;
use shopify_function::Result;

generate_types!(query_path = "input.graphql", schema_path = "schema.graphql");

// Tier rule: when eligible-line-count >= min, apply pct% off eligible items.
#[derive(serde::Deserialize, Debug)]
struct Tier {
    min: u32,
    pct: f64,
}

const NO_DISCOUNT: schema::FunctionRunResult = schema::FunctionRunResult {
    discounts: vec![],
    discount_application_strategy: schema::DiscountApplicationStrategy::First,
};

#[shopify_function]
fn run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    // Step 1: parse tier config. Fail-safe to no-discount on any error.
    let tiers = match parse_tiers(input.shop().tiers_metafield()) {
        Some(t) if !t.is_empty() => t,
        _ => return Ok(NO_DISCOUNT.clone()),
    };

    // Step 2: collect eligible variants + sum quantities.
    let mut eligible_variants: Vec<(String, i32)> = Vec::new();
    let mut eligible_qty: u32 = 0;

    for line in input.cart().lines() {
        let variant = match line.merchandise() {
            schema::run::input::cart::lines::Merchandise::ProductVariant(v) => v,
            _ => continue,
        };
        let is_eligible = variant
            .product()
            .has_tags()
            .iter()
            .any(|t| t.has_tag());
        if !is_eligible {
            continue;
        }
        eligible_variants.push((variant.id().to_string(), line.quantity()));
        eligible_qty = eligible_qty.saturating_add(line.quantity() as u32);
    }

    // Step 3: select highest matching tier.
    let tier = match select_tier(&tiers, eligible_qty) {
        Some(t) => t,
        None => return Ok(NO_DISCOUNT.clone()),
    };

    // Step 4: build discount targets.
    let targets: Vec<schema::Target> = eligible_variants
        .into_iter()
        .map(|(id, _qty)| schema::Target::ProductVariant(schema::ProductVariantTarget {
            id,
            quantity: None,
        }))
        .collect();

    if targets.is_empty() {
        return Ok(NO_DISCOUNT.clone());
    }

    Ok(schema::FunctionRunResult {
        discounts: vec![schema::Discount {
            message: Some(format!("Bundle: save {}%", tier.pct as i32)),
            targets,
            value: schema::Value::Percentage(schema::Percentage {
                value: tier.pct.into(),
            }),
        }],
        discount_application_strategy: schema::DiscountApplicationStrategy::First,
    })
}

// Parse tiers metafield. Returns None if missing/malformed.
fn parse_tiers(mf: Option<&schema::Metafield>) -> Option<Vec<Tier>> {
    let raw = mf?.json_value();
    serde_json::from_str::<Vec<Tier>>(&raw.to_string()).ok()
}

// Pick the tier with the highest `min` that's still <= eligible_qty.
fn select_tier(tiers: &[Tier], eligible_qty: u32) -> Option<&Tier> {
    tiers
        .iter()
        .filter(|t| t.min <= eligible_qty)
        .max_by_key(|t| t.min)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(min: u32, pct: f64) -> Tier {
        Tier { min, pct }
    }

    #[test]
    fn select_tier_picks_highest_matching() {
        let tiers = vec![t(2, 15.0), t(3, 25.0)];
        assert_eq!(select_tier(&tiers, 0).map(|x| x.pct), None);
        assert_eq!(select_tier(&tiers, 1).map(|x| x.pct), None);
        assert_eq!(select_tier(&tiers, 2).map(|x| x.pct), Some(15.0));
        assert_eq!(select_tier(&tiers, 3).map(|x| x.pct), Some(25.0));
        assert_eq!(select_tier(&tiers, 99).map(|x| x.pct), Some(25.0));
    }

    #[test]
    fn select_tier_empty_input() {
        assert!(select_tier(&[], 5).is_none());
    }

    #[test]
    fn select_tier_unordered_input() {
        // Don't assume tiers come sorted; pick by max min, not by position.
        let tiers = vec![t(3, 25.0), t(2, 15.0)];
        assert_eq!(select_tier(&tiers, 2).map(|x| x.pct), Some(15.0));
        assert_eq!(select_tier(&tiers, 3).map(|x| x.pct), Some(25.0));
    }
}
