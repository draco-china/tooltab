import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Skeleton,
  Spinner,
  Switch,
} from "@heroui/react";
import {
  BadgeCheck,
  Lock,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import {
  BcryptError,
  type BcryptErrorCode,
  type BcryptResult,
} from "@workspace/tools/crypto/bcrypt";
import { runBcrypt } from "./worker-client";

const SAMPLE_PASSWORD = "correct horse battery staple";
const SAMPLE_HASH =
  "$2b$10$9goojv/JvRhQvBIMI6yJNu9mziiWggh4.5/rpJAIhx66y28hq4Ybe";

function BcryptHashPasswordVerifierPageContent() {
  const passwordId = useId();
  const hashId = useId();
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const [password, setPassword] = useState("");
  const [hash, setHash] = useState("");
  const [truncate, setTruncate] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [hashVisible, setHashVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BcryptResult | null>(null);
  const [errorCode, setErrorCode] = useState<BcryptErrorCode | null>(null);

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
    setBusy(false);
    setResult(null);
    setErrorCode(null);
  }

  function reset() {
    invalidate();
    setPassword("");
    setHash("");
    setTruncate(false);
    setPasswordVisible(false);
    setHashVisible(false);
  }

  function useSample() {
    invalidate();
    setPassword(SAMPLE_PASSWORD);
    setHash(SAMPLE_HASH);
  }

  async function verify() {
    if (!hash.trim() || busy) return;
    invalidate();
    const controller = new AbortController();
    const currentRevision = revision.current;
    task.current = controller;
    setBusy(true);
    try {
      const nextResult = await runBcrypt(
        { kind: "verify", password, hash, truncate },
        controller.signal,
      );
      if (revision.current === currentRevision && !controller.signal.aborted) {
        setResult(nextResult);
      }
    } catch (error) {
      if (revision.current === currentRevision && !controller.signal.aborted) {
        setErrorCode(
          error instanceof BcryptError ? error.code : "worker_failed",
        );
      }
    } finally {
      if (revision.current === currentRevision) {
        task.current = null;
        setBusy(false);
      }
    }
  }

  const invalidHash = errorCode === "invalid_hash";
  const errorMessage = (() => {
    switch (errorCode) {
      case "invalid_password":
        return m["shared.bcrypt.invalidPassword"]();
      case "password_too_long":
        return m["shared.bcrypt.passwordTooLong"]();
      case "invalid_cost":
        return m["shared.bcrypt.invalidCost"]();
      case "invalid_hash":
        return m["shared.bcrypt.invalidHash"]();
      case "random_failed":
        return m["shared.bcrypt.argonRandomFailed"]();
      case "worker_failed":
        return m["shared.bcrypt.workerFailed"]();
      case "timeout":
        return m["shared.bcrypt.timeout"]();
      case "busy":
        return m["shared.bcrypt.busy"]();
      default:
        return null;
    }
  })();
  const resultDescription = result
    ? result.matches
      ? m["common.argonMatch"]()
      : m["common.argonMismatch"]()
    : invalidHash
      ? m["shared.bcryptTools.verifierInvalidHashTitle"]()
      : busy
        ? m["shared.bcryptTools.verifierLoadingTitle"]()
        : m["shared.bcryptTools.verifierResultDescription"]();

  return (
    <div className="grid gap-10">
      <form
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
        onSubmit={(event) => {
          event.preventDefault();
          void verify();
        }}
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>
                {m["shared.bcryptTools.verifierInputTitle"]()}
              </Card.Title>
            </div>
            <Button type="button" variant="ghost" size="sm" onPress={useSample}>
              <Sparkles aria-hidden className="size-4" />
              {m["shared.bcrypt.sample"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <SecretField
              id={passwordId}
              name="password"
              label={m["shared.bcryptTools.verifierPasswordLabel"]()}
              placeholder={m[
                "shared.bcryptTools.verifierPasswordPlaceholder"
              ]()}
              value={password}
              visible={passwordVisible}
              showLabel={m["common.passshow"]()}
              hideLabel={m["common.passhide"]()}
              onVisibilityChange={setPasswordVisible}
              onChange={(value) => {
                invalidate();
                setPassword(value);
              }}
            />
            <SecretField
              id={hashId}
              name="bcrypt-hash"
              label={m["shared.bcrypt.hash"]()}
              description={m["shared.bcryptTools.verifierHashDescription"]()}
              placeholder={m["shared.bcryptTools.verifierHashPlaceholder"]()}
              value={hash}
              visible={hashVisible}
              invalid={invalidHash}
              showLabel={m["common.passshow"]()}
              hideLabel={m["common.passhide"]()}
              mono
              onVisibilityChange={setHashVisible}
              onChange={(value) => {
                invalidate();
                setHash(value);
              }}
            />
            <Switch
              isSelected={truncate}
              onChange={(selected) => {
                invalidate();
                setTruncate(selected);
              }}
            >
              <Switch.Content className="flex min-h-11 items-center">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span>{m["shared.bcrypt.truncate"]()}</span>
              </Switch.Content>
            </Switch>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex-wrap justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onPress={reset}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["common.actions.reset"]()}
            </Button>
            <div className="flex flex-wrap gap-2">
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onPress={invalidate}
                >
                  {m["common.actions.cancel"]()}
                </Button>
              ) : null}
              <Button type="submit" size="sm" isDisabled={busy || !hash.trim()}>
                {busy ? <Spinner size="sm" /> : null}
                {busy
                  ? m["shared.bcryptTools.verifierVerifyingLabel"]()
                  : m["shared.bcrypt.argonVerify"]()}
              </Button>
            </div>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.argon2Tools.verifierResultLabel"]()}
            </Card.Title>
            <Card.Description>{resultDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
            {errorMessage ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {invalidHash
                      ? m["shared.bcryptTools.verifierInvalidHashTitle"]()
                      : m["shared.argon2Tools.verifierResultLabel"]()}
                  </Alert.Title>
                  <Alert.Description>
                    {invalidHash
                      ? `${m["shared.bcryptTools.verifierInvalidHashDescription"]()} ${m["shared.bcryptTools.verifierInvalidHashHelp"]()}`
                      : errorMessage}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : busy ? (
              <ResultSkeleton
                label={m["shared.bcryptTools.verifierLoadingTitle"]()}
              />
            ) : result ? (
              <VerificationResult result={result} />
            ) : (
              <EmptyResult
                title={m["shared.argon2Tools.verifierIdleTitle"]()}
                description={m["shared.bcryptTools.verifierEmptyDescription"]()}
              />
            )}
            {result?.truncated ? (
              <p role="status" className="text-sm text-warning">
                {m["shared.bcrypt.truncated"]()}
              </p>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </form>

      <ToolArticle>
        <h2>{m["shared.bcryptTools.verifierArticleWhatTitle"]()}</h2>
        <p>{m["shared.bcryptTools.verifierArticleWhatBody"]()}</p>
        <h2>{m["shared.bcryptTools.verifierArticleInputTitle"]()}</h2>
        <p>
          {renderInlineCode(m["shared.bcryptTools.verifierArticleInputBody"]())}
        </p>
        <h2>{m["shared.bcryptTools.verifierArticleResultTitle"]()}</h2>
        <p>{m["shared.bcryptTools.verifierArticleResultBody"]()}</p>
        <h2>{m["shared.bcryptTools.verifierArticleNotesTitle"]()}</h2>
        <ul>
          {[
            m["shared.bcryptTools.verifierArticleNoteItems0"](),
            m["shared.bcryptTools.verifierArticleNoteItems1"](),
            m["shared.bcryptTools.verifierArticleNoteItems2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
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
  invalid = false,
  showLabel,
  hideLabel,
  mono = false,
  onVisibilityChange,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  description?: string;
  placeholder: string;
  value: string;
  visible: boolean;
  invalid?: boolean;
  showLabel: string;
  hideLabel: string;
  mono?: boolean;
  onVisibilityChange: (visible: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <ToolPasswordInput
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={invalid}
        className={mono ? "font-mono text-sm" : undefined}
        prefix={<Lock aria-hidden className="size-4 text-muted" />}
        showLabel={showLabel}
        hideLabel={hideLabel}
        isVisible={visible}
        onVisibilityChange={onVisibilityChange}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </div>
  );
}

function EmptyResult({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
      <Lock aria-hidden className="size-5 text-muted" />
      <div className="grid gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

function ResultSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="grid min-h-72 content-center gap-3"
    >
      <Skeleton className="mx-auto size-10 rounded-full" />
      <Skeleton className="mx-auto h-4 w-1/2" />
      <Skeleton className="mx-auto h-4 w-4/5" />
    </div>
  );
}

function VerificationResult({ result }: { result: BcryptResult }) {
  return (
    <>
      <section className="rounded-xl border border-border bg-default/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Chip color={result.matches ? "success" : "danger"}>
            {result.matches ? (
              <BadgeCheck aria-hidden className="size-4" />
            ) : (
              <TriangleAlert aria-hidden className="size-4" />
            )}
            {result.matches
              ? m["common.argonMatch"]()
              : m["common.argonMismatch"]()}
          </Chip>
          <p className="text-sm text-muted">
            {result.matches
              ? m["shared.bcryptTools.verifierMatchDescription"]()
              : m["shared.bcryptTools.verifierMismatchDescription"]()}
          </p>
        </div>
      </section>
      <section aria-label={m["shared.bcryptTools.verifierDetailsTitle"]()}>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            [m["common.argonVersion"](), `$${result.version}$`],
            [m["shared.bcrypt.costValue"](), String(result.cost)],
            [m["common.archiveformat"](), "bcrypt"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-lg border border-border bg-background p-3"
            >
              <dt className="text-xs font-medium tracking-wide text-muted uppercase">
                {label}
              </dt>
              <dd className="mt-1 font-mono text-sm break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

function renderInlineCode(value: string) {
  return value
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={part}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

export default function BcryptHashPasswordVerifierPage() {
  return (
    <ToolPage>
      <BcryptHashPasswordVerifierPageContent />
    </ToolPage>
  );
}
