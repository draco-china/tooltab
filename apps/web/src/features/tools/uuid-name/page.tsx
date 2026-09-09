import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Chip,
  Input,
  Label,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  generateNameUuid,
  UUID_NAMESPACES,
  UuidNameError,
} from "@workspace/tools/uuid/name";

const errorMessages = {
  uuidn_invalid_namespace: m["shared.uuidName.uuidnInvalidNamespace"],
  uuidn_invalid_unicode: m["shared.uuidName.uuidnInvalidUnicode"],
  uuidn_too_large: m["shared.uuidName.uuidnTooLarge"],
} as const;

function UuidName({ version }: { version: 3 | 5 }) {
  const id = useId();
  const [namespace, setNamespace] = useState<string>(UUID_NAMESPACES.DNS);
  const [name, setName] = useState("example.com");
  const result = useMemo(() => {
    try {
      return { value: generateNameUuid(namespace, name, version), error: null };
    } catch (e) {
      return {
        value: "",
        error:
          `uuidn_${e instanceof UuidNameError ? e.code : "invalid_namespace"}` as keyof typeof errorMessages,
      };
    }
  }, [namespace, name, version]);
  const preset =
    Object.entries(UUID_NAMESPACES).find(
      ([, value]) => value === namespace.toLowerCase(),
    )?.[0] ?? "custom";
  return (
    <div className="grid gap-8">
      <div className="grid items-start gap-6 xl:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["shared.uuidName.uuidnOptionsTitle"]()}</Card.Title>
            <Card.Description>
              {m["shared.uuidName.uuidnOptionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">
                {m["shared.uuidName.uuidnPreset"]()}
              </legend>
              <ToggleButtonGroup
                isDetached
                selectionMode="single"
                selectedKeys={new Set([preset])}
                aria-label={m["shared.uuidName.uuidnPreset"]()}
                className="flex flex-wrap justify-start gap-2"
                onSelectionChange={(selection) => {
                  const value = String([...selection][0] ?? "");
                  if (!value) return;
                  setNamespace(
                    value === "custom"
                      ? ""
                      : UUID_NAMESPACES[value as keyof typeof UUID_NAMESPACES],
                  );
                }}
              >
                {[...Object.keys(UUID_NAMESPACES), "custom"].map((key) => (
                  <ToggleButton key={key} id={key} size="sm">
                    {key === "X500"
                      ? "X.500 DN"
                      : key === "custom"
                        ? m["shared.uuidName.uuidnCustom"]()
                        : key}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-namespace`}>
                {m["shared.uuidName.uuidnNamespace"]()}
              </Label>
              <Input
                id={`${id}-namespace`}
                dir="ltr"
                className="font-mono"
                value={namespace}
                aria-invalid={result.error === "uuidn_invalid_namespace"}
                aria-describedby={result.error ? `${id}-error` : undefined}
                onChange={(event) => setNamespace(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-name`}>
                {m["shared.uuidName.uuidnName"]()}
              </Label>
              <TextArea
                id={`${id}-name`}
                value={name}
                rows={4}
                aria-invalid={Boolean(
                  result.error && result.error !== "uuidn_invalid_namespace",
                )}
                aria-describedby={result.error ? `${id}-error` : undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {result.error ? (
              <Alert id={`${id}-error`} role="alert" status="danger">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {errorMessages[result.error]({})}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["shared.uuidName.uuidnOutput"]()}</Card.Title>
            <Card.Description>
              {m["shared.uuidName.uuidnResultDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <Input
              id={`${id}-output`}
              aria-label={m["shared.uuidName.uuidnOutput"]()}
              dir="ltr"
              readOnly
              className="font-mono"
              value={result.value}
            />
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="secondary">
                v{version}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {version === 3 ? "MD5" : "SHA-1"}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {m["shared.uuidName.uuidnDeterministic"]()}
              </Chip>
            </div>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end">
            <ToolCopyButton
              value={result.value}
              copyLabel={m["shared.uuidName.uuidnCopy"]()}
              copiedLabel={m["common.actions.copied"]()}
              errorLabel={m["shared.uuidName.uuidnCopyError"]()}
              disabled={!result.value}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.uuidName.uuidnNormalizationTitle"]()}</h2>
        <p>{m["shared.uuidName.uuidnNormalization"]()}</p>
        <h2>{m["shared.uuidName.uuidnSafetyTitle"]()}</h2>
        <p>{m["shared.uuidName.uuidnSafety"]()}</p>
      </ToolArticle>
    </div>
  );
}
export default function UuidV3Generator() {
  return <UuidName version={3} />;
}
function UuidV5GeneratorContent() {
  return <UuidName version={5} />;
}

export function UuidV5Generator() {
  return (
    <ToolPage>
      <UuidV5GeneratorContent />
    </ToolPage>
  );
}
