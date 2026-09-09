import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Card,
  Chip,
  Input,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  DEFAULT_UUID_V3_NAME,
  DEFAULT_UUID_V3_NAMESPACE,
  generateUuidV3,
  normalizeNamespaceUuid,
  resolveNamespacePresetId,
  UUID_V3_NAMESPACE_PRESETS,
  validateUuidV3Name,
} from "@workspace/tools/uuid/name";

const STORAGE_KEYS = {
  namespace: "tools:uuid-v3-generator:namespace",
  name: "tools:uuid-v3-generator:name",
} as const;

function presetLabel(id: string) {
  switch (id) {
    case "dns":
      return m["common.catalogToolUuidV3GeneratorMessagesNamespaceDnsLabel"]();
    case "url":
      return m["common.catalogToolUuidV3GeneratorMessagesNamespaceUrlLabel"]();
    case "oid":
      return m["common.catalogToolUuidV3GeneratorMessagesNamespaceOidLabel"]();
    default:
      return m["common.catalogToolUuidV3GeneratorMessagesNamespaceX500Label"]();
  }
}

function UuidV3GeneratorContent() {
  const namespaceId = useId();
  const nameId = useId();
  const resultId = useId();
  const [namespace, setNamespace] = useState<string>(DEFAULT_UUID_V3_NAMESPACE);
  const [name, setName] = useState<string>(DEFAULT_UUID_V3_NAME);

  useEffect(() => {
    try {
      setNamespace(
        localStorage.getItem(STORAGE_KEYS.namespace) ??
          DEFAULT_UUID_V3_NAMESPACE,
      );
      setName(localStorage.getItem(STORAGE_KEYS.name) ?? DEFAULT_UUID_V3_NAME);
    } catch {
      // Storage is optional; deterministic generation still works without it.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.namespace, namespace);
      localStorage.setItem(STORAGE_KEYS.name, name);
    } catch {
      // Storage is optional; deterministic generation still works without it.
    }
  }, [name, namespace]);

  const namespaceError = normalizeNamespaceUuid(namespace)
    ? ""
    : m["common.catalogToolUuidV3GeneratorMessagesNamespaceInvalid"]();
  const nameErrorCode = validateUuidV3Name(name);
  const nameError =
    nameErrorCode === "invalid-unicode"
      ? m["common.catalogToolUuidV3GeneratorMessagesNameInvalidUnicode"]()
      : nameErrorCode === "too-large"
        ? m["common.catalogToolUuidV3GeneratorMessagesNameTooLarge"]()
        : "";
  const uuid = useMemo(
    () => (namespaceError || nameError ? "" : generateUuidV3(namespace, name)),
    [name, nameError, namespace, namespaceError],
  );
  const selectedPresetId = resolveNamespacePresetId(namespace);

  return (
    <div className="grid gap-10">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["common.catalogToolUuidV3GeneratorMessagesOptionsTitle"]()}
            </Card.Title>
            <Card.Description>
              {m[
                "common.catalogToolUuidV3GeneratorMessagesOptionsDescription"
              ]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <Field
              id={namespaceId}
              label={m[
                "common.catalogToolUuidV3GeneratorMessagesNamespaceLabel"
              ]()}
              description={m[
                "common.catalogToolUuidV3GeneratorMessagesNamespaceDescription"
              ]()}
              error={namespaceError}
            >
              <Input
                id={namespaceId}
                name="uuid-v3-namespace"
                autoComplete="off"
                value={namespace}
                aria-invalid={Boolean(namespaceError) || undefined}
                spellCheck={false}
                className="font-mono text-sm"
                onChange={(event) => setNamespace(event.currentTarget.value)}
              />
            </Field>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">
                {m[
                  "common.catalogToolUuidV3GeneratorMessagesNamespacePresetLegend"
                ]()}
              </legend>
              <ToggleButtonGroup
                isDetached
                selectionMode="single"
                selectedKeys={
                  selectedPresetId ? new Set([selectedPresetId]) : new Set()
                }
                aria-label={m[
                  "common.catalogToolUuidV3GeneratorMessagesNamespacePresetLegend"
                ]()}
                className="flex flex-wrap justify-start gap-2 [&_button]:min-h-11"
                onSelectionChange={(selection) => {
                  const selected = String([...selection][0] ?? "");
                  const preset = UUID_V3_NAMESPACE_PRESETS.find(
                    (candidate) => candidate.id === selected,
                  );
                  if (preset) setNamespace(preset.value);
                }}
              >
                {UUID_V3_NAMESPACE_PRESETS.map((preset) => (
                  <ToggleButton key={preset.id} id={preset.id}>
                    {presetLabel(preset.id)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <p className="text-sm text-muted">
                {m[
                  "common.catalogToolUuidV3GeneratorMessagesNamespacePresetDescription"
                ]()}
              </p>
            </fieldset>

            <Field
              id={nameId}
              label={m["common.catalogToolUuidV3GeneratorMessagesNameLabel"]()}
              description={m[
                "common.catalogToolUuidV3GeneratorMessagesNameDescription"
              ]()}
              error={nameError}
            >
              <Input
                id={nameId}
                name="uuid-v3-name"
                autoComplete="off"
                value={name}
                placeholder={m[
                  "common.catalogToolUuidV3GeneratorMessagesNamePlaceholder"
                ]()}
                aria-invalid={Boolean(nameError) || undefined}
                spellCheck={false}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Field>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["common.catalogToolUuidV3GeneratorMessagesResultTitle"]()}
            </Card.Title>
            <Card.Description>
              {m[
                "common.catalogToolUuidV3GeneratorMessagesResultDescription"
              ]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <Field
              id={resultId}
              label={m[
                "common.catalogToolUuidV3GeneratorMessagesResultLabel"
              ]()}
              description={m[
                "common.catalogToolUuidV3GeneratorMessagesResultDescription"
              ]()}
            >
              <Input
                id={resultId}
                name="uuid-v3-result"
                autoComplete="off"
                value={uuid}
                readOnly
                placeholder={
                  namespaceError || nameError
                    ? m[
                        "common.catalogToolUuidV3GeneratorMessagesResultInvalidPlaceholder"
                      ]()
                    : m[
                        "common.catalogToolUuidV3GeneratorMessagesResultPlaceholder"
                      ]()
                }
                className="font-mono text-sm"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="secondary">
                {m[
                  "common.catalogToolUuidV3GeneratorMessagesVersionBadgeLabel"
                ]()}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {m[
                  "common.catalogToolUuidV3GeneratorMessagesVariantBadgeLabel"
                ]()}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {m[
                  "common.catalogToolUuidV3GeneratorMessagesDeterministicBadgeLabel"
                ]()}
              </Chip>
            </div>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end">
            <ToolCopyButton
              value={uuid}
              copyLabel={m[
                "common.catalogToolUuidV3GeneratorMessagesCopyUuidLabel"
              ]()}
              copiedLabel={m["common.actions.copied"]()}
              disabled={!uuid}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>
          {m["common.catalogToolUuidV3GeneratorMessagesArticleWhatTitle"]()}
        </h2>
        <p>
          {m["common.catalogToolUuidV3GeneratorMessagesArticleWhatBodyOne"]()}
        </p>
        <p>
          {m["common.catalogToolUuidV3GeneratorMessagesArticleWhatBodyTwo"]()}
        </p>
        <h3>
          {m["common.catalogToolUuidV3GeneratorMessagesArticleWhenTitle"]()}
        </h3>
        <ul>
          <li>
            {m["common.catalogToolUuidV3GeneratorMessagesArticleWhenItems0"]()}
          </li>
          <li>
            {m["common.catalogToolUuidV3GeneratorMessagesArticleWhenItems1"]()}
          </li>
          <li>
            {m["common.catalogToolUuidV3GeneratorMessagesArticleWhenItems2"]()}
          </li>
          <li>
            {m["common.catalogToolUuidV3GeneratorMessagesArticleWhenItems3"]()}
          </li>
        </ul>
        <h3>
          {m["common.catalogToolUuidV3GeneratorMessagesArticleSafetyTitle"]()}
        </h3>
        <p>
          {m["common.catalogToolUuidV3GeneratorMessagesArticleSafetyBody"]()}
        </p>
      </ToolArticle>
    </div>
  );
}

export default function UuidV3Generator() {
  return (
    <ToolPage>
      <UuidV3GeneratorContent />
    </ToolPage>
  );
}

function Field({
  id,
  label,
  description,
  error,
  children,
}: {
  id: string;
  label: string;
  description: string;
  error?: string;
  children: React.ReactNode;
}) {
  const messageId = `${id}-message`;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      <p
        id={messageId}
        role={error ? "alert" : undefined}
        className={error ? "text-sm text-danger" : "text-sm text-muted"}
      >
        {error || description}
      </p>
    </div>
  );
}
