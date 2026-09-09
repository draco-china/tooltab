import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, InputGroup, Label } from "@heroui/react";
import { X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import { BasicAuthGeneratorError } from "@workspace/tools/encoding/basic-auth";
import { generateBasicAuth } from "./operation";

const DEFAULT_USERNAME = "Aladdin";
const DEFAULT_PASSWORD = "open sesame";

function CredentialInput({
  id,
  label,
  value,
  isPassword = false,
  clearLabel,
  showLabel,
  hideLabel,
  visible = false,
  onVisibilityChange,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  isPassword?: boolean;
  clearLabel: string;
  showLabel?: string;
  hideLabel?: string;
  visible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {isPassword ? (
        <ToolPasswordInput
          id={id}
          name="password"
          aria-label={label}
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          clearLabel={clearLabel}
          showLabel={showLabel ?? label}
          hideLabel={hideLabel ?? label}
          isVisible={visible}
          onClear={() => onChange("")}
          onVisibilityChange={onVisibilityChange}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <InputGroup variant="secondary" fullWidth className="min-h-11">
          <InputGroup.Input
            id={id}
            name="username"
            aria-label={label}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
          {value ? (
            <InputGroup.Suffix>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={clearLabel}
                onPress={() => onChange("")}
              >
                <X aria-hidden className="size-4" />
              </Button>
            </InputGroup.Suffix>
          ) : null}
        </InputGroup>
      )}
    </div>
  );
}

function ReadOnlyOutput({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "authorization" | "curl";
}) {
  return (
    <section
      aria-label={label}
      className="min-h-24 w-full rounded-xl border border-border bg-default/20 px-4 py-3"
    >
      <pre className="overflow-x-auto font-mono text-sm leading-6 break-all whitespace-pre-wrap text-foreground">
        <code>
          {variant === "authorization"
            ? renderAuthorization(value)
            : renderCurl(value)}
        </code>
      </pre>
    </section>
  );
}

function renderAuthorization(value: string): ReactNode {
  const [scheme, token] = value.split(" ", 2);
  if (!scheme || !token) return value;
  return (
    <>
      <span className="font-semibold">{scheme}</span>{" "}
      <span className="text-primary">{token}</span>
    </>
  );
}

function renderCurl(value: string): ReactNode {
  const match = value.match(/^curl -H "Authorization: (.+)" (.+)$/);
  if (!match) return value;
  return (
    <>
      <span className="font-semibold">curl</span>{" "}
      <span className="font-medium text-primary">-H</span>{" "}
      <span className="text-muted">"Authorization: </span>
      {renderAuthorization(match[1] ?? "")}
      <span className="text-muted">" </span>
      <span className="font-medium text-primary">{match[2]}</span>
    </>
  );
}

function BasicAuthGeneratorPageContent() {
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [passwordVisible, setPasswordVisible] = useState(false);
  let authorization = "";
  let curl = "";
  let errorMessage = "";
  try {
    ({ authorization, curl } = generateBasicAuth(username, password));
  } catch (error) {
    const code =
      error instanceof BasicAuthGeneratorError ? error.code : "invalid_text";
    errorMessage =
      code === "invalid_username"
        ? m["tools.basicAuthGenerator.invalidUsername"]()
        : code === "too_large"
          ? m["tools.basicAuthGenerator.tooLarge"]()
          : m["tools.basicAuthGenerator.invalidText"]();
  }

  return (
    <div className="grid gap-10">
      <div className="grid gap-6" data-tool-layout="stacked" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.basicAuthGenerator.credentialsTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.basicAuthGenerator.credentialsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {errorMessage ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{errorMessage}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            <CredentialInput
              id={usernameId}
              label={m["common.httptUsername"]()}
              value={username}
              clearLabel={m["tools.basicAuthGenerator.clearUsernameLabel"]()}
              onChange={setUsername}
            />
            <CredentialInput
              id={passwordId}
              label={m["common.httptPassword"]()}
              value={password}
              isPassword
              clearLabel={m["tools.basicAuthGenerator.clearPasswordLabel"]()}
              showLabel={m["common.httptShow"]()}
              hideLabel={m["common.httptHide"]()}
              visible={passwordVisible}
              onVisibilityChange={setPasswordVisible}
              onChange={setPassword}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="grid gap-6">
          <ResultCard
            title={m["tools.basicAuthGenerator.authorizationTitle"]()}
            description={m[
              "tools.basicAuthGenerator.authorizationDescription"
            ]()}
            value={authorization}
            variant="authorization"
            copyLabel={m["common.actions.copyResult"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
          <ResultCard
            title={m["common.httptCurl"]()}
            description={m["tools.basicAuthGenerator.curlDescription"]()}
            value={curl}
            variant="curl"
            copyLabel={m["common.actions.copyResult"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.basicAuthGenerator.article.whatTitle"]()}</h2>
        <p>{m["tools.basicAuthGenerator.article.what"]()}</p>
        <h2>{m["tools.basicAuthGenerator.article.generatesTitle"]()}</h2>
        <ul>
          <li>{m["tools.basicAuthGenerator.articleGeneratesOne"]()}</li>
          <li>{m["tools.basicAuthGenerator.article.generatesTwo"]()}</li>
        </ul>
        <h2>{m["tools.basicAuthGenerator.article.notesTitle"]()}</h2>
        <ul>
          <li>{m["tools.basicAuthGenerator.article.noteOne"]()}</li>
          <li>{m["tools.basicAuthGenerator.article.noteTwo"]()}</li>
          <li>{m["tools.basicAuthGenerator.article.noteThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

function ResultCard({
  title,
  description,
  value,
  variant,
  copyLabel,
  copiedLabel,
}: {
  title: string;
  description: string;
  value: string;
  variant: "authorization" | "curl";
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-1">
          <Card.Title>{title}</Card.Title>
          <Card.Description>{description}</Card.Description>
        </div>
        <ToolCopyButton
          value={value}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          variant="ghost"
          disabled={!value}
        />
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <ReadOnlyOutput label={title} value={value} variant={variant} />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

export default function BasicAuthGeneratorPage() {
  return (
    <ToolPage instructions={m["tools.basicAuthGenerator.usage"]()}>
      <BasicAuthGeneratorPageContent />
    </ToolPage>
  );
}
