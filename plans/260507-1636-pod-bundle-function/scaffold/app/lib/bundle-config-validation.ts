// bundle-config-validation.ts
// Pure validator for bundle tier JSON. No side effects, fully unit-testable.
// Used server-side in action() AND client-side for live feedback.

export interface Tier {
  min: number; // minimum eligible items in cart (>= 1)
  pct: number; // percentage discount (1–50, margin guardrail)
}

export type ValidationResult =
  | { ok: true; tiers: Tier[] }
  | { ok: false; error: string };

// Margin guardrail: block anything above 50% (spec says ≤50).
const PCT_MAX = 50;

/**
 * Validate raw string input as a bundle tier config.
 *
 * Rules:
 *  - Must be valid JSON
 *  - Must be a non-empty array
 *  - Each element must have integer `min >= 1` and integer `pct` in [1, PCT_MAX]
 *  - Duplicate `min` values are rejected (ambiguous tier selection)
 *  - Result is sorted ascending by `min` (makes loader/preview deterministic)
 */
export function validateTiers(raw: string): ValidationResult {
  // 1. JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON — check for missing commas or brackets." };
  }

  // 2. Must be a non-empty array
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON array (e.g. [{\"min\":2,\"pct\":15}])." };
  }
  if (parsed.length === 0) {
    return { ok: false, error: "At least one tier is required." };
  }

  // 3. Validate each element
  const tiers: Tier[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, error: `Tier ${i}: must be an object with "min" and "pct".` };
    }
    const obj = item as Record<string, unknown>;

    const min = obj["min"];
    const pct = obj["pct"];

    if (typeof min !== "number" || !Number.isInteger(min) || min < 1) {
      return { ok: false, error: `Tier ${i}: "min" must be a positive integer (got ${JSON.stringify(min)}).` };
    }
    if (
      typeof pct !== "number" ||
      !Number.isInteger(pct) ||
      pct < 1 ||
      pct > PCT_MAX
    ) {
      return {
        ok: false,
        error: `Tier ${i}: "pct" must be an integer between 1 and ${PCT_MAX} (got ${JSON.stringify(pct)}).`,
      };
    }

    tiers.push({ min, pct });
  }

  // 4. Reject duplicate min values
  const mins = tiers.map((t) => t.min);
  if (new Set(mins).size !== mins.length) {
    return { ok: false, error: "Duplicate \"min\" values found — each tier must have a unique item count." };
  }

  // 5. Sort ascending by min (deterministic; matches Function's select_tier logic)
  tiers.sort((a, b) => a.min - b.min);

  return { ok: true, tiers };
}

/** Human-readable preview lines from valid tiers. */
export function tierPreviewLines(tiers: Tier[]): string[] {
  return tiers.map(
    (t) => `Buy ${t.min}+ eligible tees → save ${t.pct}%`
  );
}
