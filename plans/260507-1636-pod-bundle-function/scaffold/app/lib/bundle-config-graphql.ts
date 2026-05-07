// bundle-config-graphql.ts
// Admin GraphQL helpers for reading and writing bundle tier metafields.
// Depends on: @shopify/shopify-app-remix authenticate.admin() session.

import type { Tier } from "./bundle-config-validation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminContext {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export interface BundleConfig {
  tiers: Tier[] | null; // null = metafield not yet set
  shopId: string;       // "gid://shopify/Shop/<id>" — needed for metafieldsSet ownerId
}

// ---------------------------------------------------------------------------
// Query: read current tiers metafield
// ---------------------------------------------------------------------------

const QUERY_BUNDLE_CONFIG = `#graphql
  query GetBundleConfig {
    shop {
      id
      metafield(namespace: "bundles", key: "tiers") {
        value
      }
    }
  }
`;

/** Fetch current bundle config from shop metafields. */
export async function getBundleConfig(admin: AdminContext): Promise<BundleConfig> {
  const response = await admin.graphql(QUERY_BUNDLE_CONFIG);
  const json = (await response.json()) as {
    data?: {
      shop?: {
        id: string;
        metafield?: { value: string } | null;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  const shop = json.data?.shop;
  if (!shop) {
    throw new Error("Unexpected response: missing shop data.");
  }

  let tiers: Tier[] | null = null;
  if (shop.metafield?.value) {
    try {
      tiers = JSON.parse(shop.metafield.value) as Tier[];
    } catch {
      // Metafield exists but is malformed — treat as unset; admin can correct.
      tiers = null;
    }
  }

  return { shopId: shop.id, tiers };
}

// ---------------------------------------------------------------------------
// Mutation: write tiers metafield
// ---------------------------------------------------------------------------

const MUTATION_SET_BUNDLE_CONFIG = `#graphql
  mutation SetBundleConfig($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export interface SetBundleConfigResult {
  ok: true;
  value: string;          // stringified JSON echoed back from API
} | {
  ok: false;
  error: string;
};

/** Write tiers array to shop metafield. Returns ok/error result. */
export async function setBundleConfig(
  admin: AdminContext,
  shopId: string,
  tiers: Tier[]
): Promise<{ ok: boolean; error?: string; value?: string }> {
  const value = JSON.stringify(tiers);

  const response = await admin.graphql(MUTATION_SET_BUNDLE_CONFIG, {
    variables: {
      metafields: [
        {
          ownerId: shopId,
          namespace: "bundles",
          key: "tiers",
          type: "json",
          value,
        },
      ],
    },
  });

  const json = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        metafields: Array<{ id: string; namespace: string; key: string; value: string }>;
        userErrors: Array<{ field: string; message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  // Top-level GraphQL errors (auth, network)
  if (json.errors?.length) {
    return { ok: false, error: json.errors.map((e) => e.message).join("; ") };
  }

  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    // Sanitize: return field + message only, no internal IDs
    const msg = userErrors.map((e) => `${e.field}: ${e.message}`).join("; ");
    return { ok: false, error: `Shopify rejected the save — ${msg}` };
  }

  const written = json.data?.metafieldsSet?.metafields?.[0]?.value;
  return { ok: true, value: written ?? value };
}
