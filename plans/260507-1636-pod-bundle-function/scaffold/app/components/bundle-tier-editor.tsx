// bundle-tier-editor.tsx
// Polaris card component: JSON textarea + live validation error + tier preview.
// Extracted from app.bundle-config.tsx to keep the route file under 200 lines.

import { useCallback } from "react";
import {
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  List,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { validateTiers, tierPreviewLines } from "../lib/bundle-config-validation";

interface BundleTierEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
  /** Validation error from server action (shown in addition to live client error) */
  serverError?: string | null;
}

export function BundleTierEditor({
  value,
  onChange,
  onSave,
  onReset,
  isSaving,
  serverError,
}: BundleTierEditorProps) {
  // Live client-side validation
  const validation = validateTiers(value);
  const localError = validation.ok ? null : validation.error;
  const previewLines = validation.ok ? tierPreviewLines(validation.tiers) : [];

  // Prefer server error when present (e.g. scope denial) — client error otherwise
  const displayError = serverError ?? localError ?? undefined;
  const saveDisabled = !!localError || isSaving;

  const handleChange = useCallback(
    (next: string) => onChange(next),
    [onChange]
  );

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Tier JSON
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued">
          Edit the discount tiers below. Each tier needs a minimum item count
          (<code>min</code>) and a percentage discount (<code>pct</code>, max
          50%).
        </Text>

        <FormLayout>
          <TextField
            label="Tiers (JSON)"
            value={value}
            onChange={handleChange}
            multiline={8}
            monospaced
            autoComplete="off"
            error={displayError}
            ariaLabel="Bundle tier configuration JSON"
            helpText='Format: [{"min": 2, "pct": 15}, {"min": 3, "pct": 25}]'
          />
        </FormLayout>

        {previewLines.length > 0 && (
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" fontWeight="semibold">
              Preview:
            </Text>
            <List type="bullet">
              {previewLines.map((line) => (
                <List.Item key={line}>{line}</List.Item>
              ))}
            </List>
          </BlockStack>
        )}

        <InlineStack gap="300" align="start">
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saveDisabled}
            loading={isSaving}
            accessibilityLabel="Save bundle tier configuration"
          >
            Save
          </Button>
          <Button
            variant="plain"
            onClick={onReset}
            disabled={isSaving}
            accessibilityLabel="Reset tiers to default values"
          >
            Reset to defaults
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
