// app.bundle-config.tsx
// Polaris admin page for editing bundle discount tier configuration.
// Route: /app/bundle-config (embedded Shopify admin iframe via App Bridge).
//
// Loader: reads current tiers from shop metafield `bundles.tiers`.
// Action: validates tier JSON server-side, writes via metafieldsSet mutation.
// Component: delegates form rendering to <BundleTierEditor>.

import { useState, useCallback } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit } from "@remix-run/react";
import { Page, Layout, Card, Banner, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getBundleConfig, setBundleConfig } from "../lib/bundle-config-graphql";
import { validateTiers } from "../lib/bundle-config-validation";
import { BundleTierEditor } from "../components/bundle-tier-editor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIERS_JSON = JSON.stringify(
  [{ min: 2, pct: 15 }, { min: 3, pct: 25 }],
  null,
  2
);

// ---------------------------------------------------------------------------
// Loader — fetch current metafield value
// ---------------------------------------------------------------------------

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const config = await getBundleConfig(admin);
  return json({
    tiersJson: config.tiers ? JSON.stringify(config.tiers, null, 2) : DEFAULT_TIERS_JSON,
    shopId: config.shopId,
  });
}

// ---------------------------------------------------------------------------
// Action — validate + write metafield
// ---------------------------------------------------------------------------

type ActionData =
  | { ok: true; savedJson: string }
  | { ok: false; error: string };

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const rawJson = formData.get("tiersJson");

  if (typeof rawJson !== "string" || rawJson.trim() === "") {
    return json<ActionData>({ ok: false, error: "Tier JSON is required." }, { status: 400 });
  }

  // Server-side validation is authoritative — client validation is UX only
  const validation = validateTiers(rawJson);
  if (!validation.ok) {
    return json<ActionData>({ ok: false, error: validation.error }, { status: 422 });
  }

  const config = await getBundleConfig(admin);
  const result = await setBundleConfig(admin, config.shopId, validation.tiers);

  if (!result.ok) {
    return json<ActionData>({ ok: false, error: result.error ?? "Unknown save error." }, { status: 500 });
  }

  return json<ActionData>({
    ok: true,
    savedJson: JSON.stringify(validation.tiers, null, 2),
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BundleConfigPage() {
  const { tiersJson: initialJson } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSaving = navigation.state === "submitting";

  // Initialise from last successful save (sorted tiers) or loader value
  const [tiersJson, setTiersJson] = useState<string>(
    actionData?.ok === true ? actionData.savedJson : initialJson
  );

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.set("tiersJson", tiersJson);
    submit(formData, { method: "post" });
  }, [tiersJson, submit]);

  const handleReset = useCallback(() => {
    setTiersJson(DEFAULT_TIERS_JSON);
  }, []);

  const serverError = actionData?.ok === false ? actionData.error : null;
  const saveSucceeded = actionData?.ok === true;

  return (
    <Page
      title="Bundle Discount Configuration"
      subtitle="Set quantity-tier discounts for bundle-eligible tees."
    >
      <Layout>
        {saveSucceeded && (
          <Layout.Section>
            <Banner tone="success" title="Saved successfully">
              <p>Tier config updated. The discount function will use new values on the next cart calculation.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BundleTierEditor
            value={tiersJson}
            onChange={setTiersJson}
            onSave={handleSave}
            onReset={handleReset}
            isSaving={isSaving}
            serverError={serverError}
          />
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">How it works</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Products tagged <code>bundle-eligible</code> are counted in the
                cart. The highest matching tier applies to all eligible lines.
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Changes take effect on the next cart calculation — no app restart needed.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
