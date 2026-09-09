import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Chip, Spinner, TextArea } from "@heroui/react";
import { BadgeCheck, Lock, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import type { ArgonResult } from "@workspace/tools/crypto/argon2";
import { runArgon } from "./worker-client";

type VerificationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "verified" | "mismatch"; result: ArgonResult };

function PanelHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      {description ? <Card.Description>{description}</Card.Description> : null}
    </Card.Header>
  );
}

function Field({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}

function SecretField({
  id,
  name,
  label,
  description,
  placeholder,
  value,
  visible,
  showLabel,
  hideLabel,
  onChange,
  onToggle,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  placeholder: string;
  value: string;
  visible: boolean;
  showLabel: string;
  hideLabel: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <Field id={id} label={label} description={description}>
      <ToolPasswordInput
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        variant="primary"
        showLabel={showLabel}
        hideLabel={hideLabel}
        isVisible={visible}
        onVisibilityChange={onToggle}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function Argon2HashPasswordVerifierPageContent() {
  const id = useId();
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const [password, setPassword] = useState("");
  const [hash, setHash] = useState("");
  const [secret, setSecret] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [state, setState] = useState<VerificationState>({ status: "idle" });
  const canVerify = hash.trim().length > 0 && state.status !== "loading";

  useEffect(
    () => () => {
      revision.current += 1;
      task.current?.abort();
    },
    [],
  );

  function invalidate() {
    revision.current += 1;
    task.current?.abort();
    task.current = null;
    setState({ status: "idle" });
  }

  function change(value: string, setter: (next: string) => void) {
    invalidate();
    setter(value);
  }

  function reset() {
    invalidate();
    setPassword("");
    setHash("");
    setSecret("");
  }

  async function verify() {
    if (!canVerify) return;
    invalidate();
    const controller = new AbortController();
    const current = revision.current;
    task.current = controller;
    setState({ status: "loading" });
    try {
      const result = await runArgon(
        { kind: "verify", password, secret, hash },
        controller.signal,
      );
      if (revision.current === current && !controller.signal.aborted) {
        setState({
          status: result.matches ? "verified" : "mismatch",
          result,
        });
      }
    } catch {
      if (revision.current === current && !controller.signal.aborted) {
        setState({ status: "invalid" });
      }
    } finally {
      if (task.current === controller) task.current = null;
    }
  }

  return (
    <div className="grid gap-10">
      <form
        className="grid gap-6"
        data-tool-panels
        onSubmit={(event) => {
          event.preventDefault();
          void verify();
        }}
      >
        <ToolPanelCard>
          <PanelHeader title={m["shared.argon2Tools.verifierFormLabel"]({})} />
          <ToolPanelCardContent className="gap-5 py-4">
            <SecretField
              id={`${id}-password`}
              name="argon2-password-candidate"
              label={m["shared.aesTools.decryptpasswordlabel"]({})}
              description={m["shared.argon2Tools.verifierPasswordDescription"](
                {},
              )}
              placeholder={m["shared.argon2Tools.verifierPasswordPlaceholder"](
                {},
              )}
              value={password}
              visible={showPassword}
              showLabel={m["shared.aesTools.showpassword"]({})}
              hideLabel={m["shared.aesTools.hidepassword"]({})}
              onChange={(value) => change(value, setPassword)}
              onToggle={() => setShowPassword((current) => !current)}
            />
            <Field
              id={`${id}-hash`}
              label={m["shared.argon2Tools.verifierHashLabel"]({})}
              description={m["shared.argon2Tools.verifierHashDescription"]({})}
            >
              <TextArea
                id={`${id}-hash`}
                name="argon2-encoded-hash"
                value={hash}
                placeholder={m["shared.argon2Tools.verifierHashPlaceholder"](
                  {},
                )}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-h-32 resize-y font-mono text-xs"
                onChange={(event) => change(event.target.value, setHash)}
              />
            </Field>
            <SecretField
              id={`${id}-secret`}
              name="argon2-secret"
              label={m["shared.argon2Tools.verifierSecretLabel"]({})}
              description={m["shared.argon2Tools.verifierSecretDescription"](
                {},
              )}
              placeholder={m["shared.argon2Tools.verifierSecretPlaceholder"](
                {},
              )}
              value={secret}
              visible={showSecret}
              showLabel={m["shared.argon2Tools.verifierShowSecretLabel"]({})}
              hideLabel={m["shared.argon2Tools.verifierHideSecretLabel"]({})}
              onChange={(value) => change(value, setSecret)}
              onToggle={() => setShowSecret((current) => !current)}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex-wrap justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              isDisabled={
                state.status === "loading" || (!password && !hash && !secret)
              }
              onPress={reset}
            >
              {m["common.actions.reset"]({})}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isDisabled={!canVerify}
            >
              {state.status === "loading" ? (
                <Spinner size="sm" />
              ) : (
                <Lock aria-hidden className="size-4" />
              )}
              {state.status === "loading"
                ? m["shared.argon2Tools.verifierVerifyingButtonLabel"]({})
                : m["shared.argon2Tools.verifierVerifyButtonLabel"]({})}
            </Button>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <PanelHeader
            title={m["shared.argon2Tools.verifierResultLabel"]({})}
            description={m["shared.argon2Tools.verifierResultDescription"]({})}
          />
          <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
            <ResultState state={state} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </form>
      <VerifierArticle />
    </div>
  );
}

function ResultState({ state }: { state: VerificationState }) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <Empty className="min-h-44 border border-separator bg-default/20">
        {state.status === "loading" ? (
          <EmptyMedia>
            <Spinner size="sm" />
          </EmptyMedia>
        ) : null}
        <EmptyHeader>
          <EmptyTitle>
            {state.status === "loading"
              ? m["shared.argon2Tools.verifierVerifyingTitle"]({})
              : m["shared.argon2Tools.verifierIdleTitle"]({})}
          </EmptyTitle>
          <EmptyDescription>
            {state.status === "loading"
              ? m["shared.argon2Tools.verifierVerifyingDescription"]({})
              : m["shared.argon2Tools.verifierIdleDescription"]({})}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (state.status === "invalid") {
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>
            <strong>{m["shared.argon2Tools.verifierInvalidTitle"]({})}</strong>
            <span className="mt-1 block">
              {m["shared.argon2Tools.verifierInvalidDescription"]({})}
            </span>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  const verified = state.status === "verified";
  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-separator bg-default/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {verified ? (
                <BadgeCheck aria-hidden className="size-4" />
              ) : (
                <TriangleAlert aria-hidden className="size-4" />
              )}
              {verified
                ? m["common.argonMatch"]({})
                : m["common.argonMismatch"]({})}
            </p>
            <p className="text-sm text-muted">
              {verified
                ? m["shared.argon2Tools.verifierVerifiedDescription"]({})
                : m["shared.argon2Tools.verifierMismatchDescription"]({})}
            </p>
          </div>
          <Chip size="sm" variant={verified ? "primary" : "secondary"}>
            {state.result.algorithm}
          </Chip>
        </div>
      </div>
      <VerificationDetails result={state.result} />
    </section>
  );
}

function VerificationDetails({ result }: { result: ArgonResult }) {
  const details = [
    [m["common.uuidiVariant"]({}), result.algorithm],
    [m["common.argonVersion"]({}), String(result.version)],
    [
      m["shared.argon2Tools.verifierMemoryCostLabel"]({}),
      `${result.memorySize} KiB`,
    ],
    [m["common.argonIterations"]({}), String(result.iterations)],
    [
      m["shared.argon2Tools.hashParallelismLabel"]({}),
      String(result.parallelism),
    ],
    [
      m["shared.argon2Tools.verifierSaltLengthLabel"]({}),
      `${result.saltLength} B`,
    ],
    [
      m["shared.argon2Tools.verifierDigestLengthLabel"]({}),
      `${result.hashLength} B`,
    ],
  ] as const;
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-medium">
        {m["shared.argon2Tools.verifierHashDetailsLabel"]({})}
      </h3>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {details.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-separator bg-background p-3"
          >
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 font-mono text-sm break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function inlineCode(text: string) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={part}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

function VerifierArticle() {
  return (
    <ToolArticle>
      <h2>{m["shared.argon2Tools.verifierArticleWhatTitle"]({})}</h2>
      <p>{m["shared.argon2Tools.verifierArticleWhatBody"]({})}</p>
      <h2>{m["shared.argon2Tools.verifierArticleWhenTitle"]({})}</h2>
      <ul>
        {[
          m["shared.argon2Tools.verifierArticleWhenItems0"]({}),
          m["shared.argon2Tools.verifierArticleWhenItems1"]({}),
          m["shared.argon2Tools.verifierArticleWhenItems2"]({}),
          m["shared.argon2Tools.verifierArticleWhenItems3"]({}),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{m["shared.argon2Tools.verifierArticleHowTitle"]({})}</h2>
      <ol>
        {[
          m["shared.argon2Tools.verifierArticleHowItems0"]({}),
          m["shared.argon2Tools.verifierArticleHowItems1"]({}),
          m["shared.argon2Tools.verifierArticleHowItems2"]({}),
          m["shared.argon2Tools.verifierArticleHowItems3"]({}),
        ].map((item) => (
          <li key={item}>{inlineCode(item)}</li>
        ))}
      </ol>
      <h2>{m["shared.argon2Tools.verifierArticleSecurityTitle"]({})}</h2>
      <p>{m["shared.argon2Tools.verifierArticleSecurityBody"]({})}</p>
    </ToolArticle>
  );
}

export default function Argon2HashPasswordVerifierPage() {
  return (
    <ToolPage>
      <Argon2HashPasswordVerifierPageContent />
    </ToolPage>
  );
}
