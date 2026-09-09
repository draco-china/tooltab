import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Skeleton,
  Slider,
  Spinner,
  Switch,
} from "@heroui/react";
import { Lock, RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  BcryptError,
  type BcryptErrorCode,
  type BcryptResult,
  DEFAULT_COST,
  MAX_COST,
  MIN_COST,
  parseCostInput,
} from "@workspace/tools/crypto/bcrypt";
import { runBcrypt } from "./worker-client";

const COST_STORAGE_KEY = "tools:bcrypt-hash-password:cost";

function BcryptHashPasswordPageContent() {
  const passwordId = useId();
  const costId = useId();
  const task = useRef<AbortController | null>(null);
  const generationId = useRef(0);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [costInput, setCostInput] = useState(String(DEFAULT_COST));
  const [truncate, setTruncate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BcryptResult | null>(null);
  const [errorCode, setErrorCode] = useState<BcryptErrorCode | null>(null);
  const costState = parseCostInput(costInput);

  useEffect(() => {
    const storedCost = safeLocalStorage.getItem(COST_STORAGE_KEY);
    if (storedCost !== null && parseCostInput(storedCost).isValid) {
      setCostInput(storedCost);
    }
  }, []);

  useEffect(() => {
    if (costState.isValid) {
      safeLocalStorage.setItem(COST_STORAGE_KEY, String(costState.value));
    }
  }, [costState.isValid, costState.value]);

  useEffect(
    () => () => {
      generationId.current += 1;
      task.current?.abort();
    },
    [],
  );

  function invalidate() {
    generationId.current += 1;
    task.current?.abort();
    task.current = null;
    setBusy(false);
    setResult(null);
    setErrorCode(null);
  }

  function reset() {
    invalidate();
    setPassword("");
    setShowPassword(false);
    setCostInput(String(DEFAULT_COST));
    setTruncate(false);
  }

  async function generate() {
    if (!password || !costState.isValid || busy) return;
    invalidate();
    const controller = new AbortController();
    const currentGeneration = generationId.current;
    task.current = controller;
    setBusy(true);
    try {
      const nextResult = await runBcrypt(
        {
          kind: "hash",
          password,
          cost: costState.value,
          truncate,
        },
        controller.signal,
      );
      if (
        generationId.current === currentGeneration &&
        !controller.signal.aborted
      ) {
        setResult(nextResult);
      }
    } catch (error) {
      if (
        generationId.current === currentGeneration &&
        !controller.signal.aborted
      ) {
        setErrorCode(
          error instanceof BcryptError ? error.code : "worker_failed",
        );
      }
    } finally {
      if (generationId.current === currentGeneration) {
        task.current = null;
        setBusy(false);
      }
    }
  }

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

  return (
    <div className="grid gap-10">
      <form
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.bcryptTools.generatorInputTitle"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor={passwordId}>
                {m["shared.aesTools.decryptpasswordlabel"]()}
              </label>
              <ToolPasswordInput
                id={passwordId}
                name="password"
                value={password}
                placeholder={m[
                  "shared.bcryptTools.generatorPasswordPlaceholder"
                ]()}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                showLabel={m["shared.aesTools.showpassword"]()}
                hideLabel={m["shared.aesTools.hidepassword"]()}
                isVisible={showPassword}
                onVisibilityChange={setShowPassword}
                onChange={(event) => {
                  invalidate();
                  setPassword(event.currentTarget.value);
                }}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium" htmlFor={costId}>
                  {m["shared.bcryptTools.generatorCostLabel"]()}
                </label>
                <Input
                  id={costId}
                  name="cost"
                  type="number"
                  inputMode="numeric"
                  min={MIN_COST}
                  max={MAX_COST}
                  step={1}
                  value={costInput}
                  aria-invalid={!costState.isValid}
                  className="w-24 text-right"
                  onChange={(event) => {
                    invalidate();
                    setCostInput(event.currentTarget.value);
                  }}
                />
              </div>
              <Slider
                aria-label={m["shared.bcryptTools.generatorCostLabel"]()}
                minValue={MIN_COST}
                maxValue={MAX_COST}
                step={1}
                value={Math.min(MAX_COST, Math.max(MIN_COST, costState.value))}
                onChange={(value) => {
                  invalidate();
                  setCostInput(String(value));
                }}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              <p className="text-sm text-muted">
                {m["shared.bcryptTools.generatorCostDescription"]()}
              </p>
              {!costState.isValid ? (
                <p role="alert" className="text-sm text-danger">
                  {m["shared.bcryptTools.generatorCostInvalidMessage"]()}
                </p>
              ) : null}
            </div>

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
              <Button
                type="submit"
                size="sm"
                isDisabled={busy || !password || !costState.isValid}
              >
                {busy ? <Spinner size="sm" /> : <Lock className="size-4" />}
                {busy
                  ? m["shared.bcryptTools.generatorGeneratingLabel"]()
                  : m["common.argonGenerate"]()}
              </Button>
            </div>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>{m["shared.bcrypt.hash"]()}</Card.Title>
              <Card.Description>
                {m["shared.bcryptTools.generatorOutputDescription"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {result ? (
                <Chip size="sm" variant="soft">
                  {m["shared.bcryptTools.generatorGeneratedSummary"]({
                    cost: String(result.cost),
                  })}
                </Chip>
              ) : null}
              <ToolCopyButton
                key={result?.hash ?? "empty"}
                value={result?.hash ?? ""}
                copyLabel={m["common.argonCopy"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={!result || busy}
                variant="ghost"
              />
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
            {errorMessage ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["shared.bcryptTools.generatorErrorTitle"]()}
                  </Alert.Title>
                  <Alert.Description>{errorMessage}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : busy ? (
              <OutputSkeleton
                label={m["shared.bcryptTools.generatorGeneratingLabel"]()}
              />
            ) : result ? (
              <ReadyOutput result={result} />
            ) : (
              <EmptyOutput
                title={m["shared.bcryptTools.generatorEmptyTitle"]()}
                description={m[
                  "shared.bcryptTools.generatorEmptyDescription"
                ]()}
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
        <h2>{m["shared.bcryptTools.generatorArticleWhatTitle"]()}</h2>
        <p>{m["shared.bcryptTools.generatorArticleWhatBody"]()}</p>
        <h2>{m["shared.argon2Tools.verifierArticleWhenTitle"]()}</h2>
        <ul>
          {[
            m["shared.bcryptTools.generatorArticleWhenItems0"](),
            m["shared.bcryptTools.generatorArticleWhenItems1"](),
            m["shared.bcryptTools.generatorArticleWhenItems2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["shared.bcryptTools.generatorArticleCostTitle"]()}</h2>
        <p>{m["shared.bcryptTools.generatorArticleCostBody"]()}</p>
        <h2>{m["shared.bcryptTools.generatorArticleNotesTitle"]()}</h2>
        <ul>
          {[
            m["shared.bcryptTools.generatorArticleNoteItems0"](),
            m["shared.bcryptTools.generatorArticleNoteItems1"](),
            m["shared.bcryptTools.generatorArticleNoteItems2"](),
            m["shared.bcryptTools.generatorArticleNoteItems3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

function EmptyOutput({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
      <Lock aria-hidden className="size-5 text-muted" />
      <div className="grid gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="grid min-h-80 content-center gap-3"
    >
      <Skeleton className="mx-auto size-10 rounded-full" />
      <Skeleton className="mx-auto h-4 w-1/2" />
      <Skeleton className="mx-auto h-4 w-4/5" />
    </div>
  );
}

function ReadyOutput({ result }: { result: BcryptResult }) {
  const details = [
    [m["common.argonVersion"](), result.version],
    [m["shared.bcrypt.costValue"](), String(result.cost)],
    [m["shared.bcrypt.salt"](), result.salt],
    [m["common.identifierchecksum"](), result.checksum],
    [m["shared.bcrypt.bytes"](), String(result.passwordBytes)],
  ];
  return (
    <section
      className="grid gap-5"
      aria-label={m["shared.bcryptTools.generatorHashDetailsLabel"]()}
    >
      <output
        aria-label={m["shared.bcryptTools.generatorHashValueLabel"]()}
        className="min-h-28 rounded-lg border border-border bg-default/30 p-4 font-mono text-sm break-all"
      >
        {result.hash}
      </output>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {details.map(([label, value]) => (
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
  );
}

export default function BcryptHashPasswordPage() {
  return (
    <ToolPage>
      <BcryptHashPasswordPageContent />
    </ToolPage>
  );
}
