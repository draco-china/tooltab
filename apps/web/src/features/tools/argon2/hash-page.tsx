import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Spinner,
} from "@heroui/react";
import { Lock, RefreshCcw, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/base/empty";
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
import { getLocale } from "@/paraglide/runtime.js";
import {
  type Algorithm,
  ArgonError,
  type ArgonErrorCode,
  type ArgonResult,
  DEFAULTS,
  decode64,
  randomSalt,
} from "@workspace/tools/crypto/argon2";
import { runArgon } from "./worker-client";

const numericFields = [
  "iterations",
  "memorySize",
  "parallelism",
  "hashLength",
] as const;
type NumericField = (typeof numericFields)[number];
type NumericInputs = Record<NumericField, string>;

const initialNumbers: NumericInputs = {
  iterations: String(DEFAULTS.iterations),
  memorySize: String(DEFAULTS.memorySize),
  parallelism: String(DEFAULTS.parallelism),
  hashLength: String(DEFAULTS.hashLength),
};
const numericRanges: Record<NumericField, readonly [number, number]> = {
  iterations: [1, 12],
  memorySize: [8, 262144],
  parallelism: [1, 16],
  hashLength: [4, 64],
};
const storageKeys = {
  algorithm: "tools:argon2-hash-password:algorithm",
  iterations: "tools:argon2-hash-password:iterations",
  memorySize: "tools:argon2-hash-password:memory-size",
  parallelism: "tools:argon2-hash-password:parallelism",
  hashLength: "tools:argon2-hash-password:hash-length",
} as const;

function PanelHeader({
  actions,
  title,
  description,
}: {
  actions?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="grid min-w-0 gap-1">
        <Card.Title>{title}</Card.Title>
        {description ? (
          <Card.Description>{description}</Card.Description>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      ) : null}
    </Card.Header>
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
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : description ? (
        <p className="text-sm text-muted">{description}</p>
      ) : null}
    </div>
  );
}

function parseNumericInput(value: string, field: NumericField) {
  const [minimum, maximum] = numericRanges[field];
  const fallback = DEFAULTS[field];
  const trimmed = value.trim();
  if (!trimmed) return { value: fallback, valid: true };
  if (!/^\d+$/.test(trimmed)) return { value: fallback, valid: false };
  const parsed = Number(trimmed);
  return {
    value: parsed,
    valid:
      Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum,
  };
}

function validateSalt(value: string): "" | "base64" | "tooShort" {
  try {
    const salt = decode64(value);
    return salt.length >= 8 && salt.length <= 65536 ? "" : "tooShort";
  } catch {
    return "base64";
  }
}

function useArgonTask() {
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(
    () => () => {
      revision.current++;
      task.current?.abort();
    },
    [],
  );

  function abort() {
    revision.current++;
    task.current?.abort();
    task.current = null;
  }

  function start() {
    abort();
    const controller = new AbortController();
    task.current = controller;
    return { controller, current: revision.current };
  }

  function isCurrent(controller: AbortController, current: number) {
    return (
      task.current === controller &&
      revision.current === current &&
      !controller.signal.aborted
    );
  }

  function finish(controller: AbortController) {
    if (task.current === controller) task.current = null;
  }

  return { abort, finish, isCurrent, start };
}

function AlgorithmSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Algorithm;
  onChange: (value: Algorithm) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(next) => {
        if (next != null) onChange(String(next) as Algorithm);
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id} className="w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {(["argon2id", "argon2i", "argon2d"] as const).map((algorithm) => (
            <ListBox.Item key={algorithm} id={algorithm} textValue={algorithm}>
              {algorithm[0]?.toUpperCase()}
              {algorithm.slice(1)}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function PasswordField({
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
  description?: string;
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
        variant="secondary"
        showLabel={showLabel}
        hideLabel={hideLabel}
        isVisible={visible}
        onVisibilityChange={onToggle}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function ResultContent({
  busy,
  error,
  result,
}: {
  busy: boolean;
  error: ArgonErrorCode | "";
  result: ArgonResult | null;
}) {
  if (error) {
    const message =
      error === "invalid_input" || error === "invalid_parameters"
        ? m["shared.argon2Tools.hashInvalidConfigurationMessage"]()
        : error === "invalid_salt"
          ? m["shared.argon2Tools.hashSaltInvalidBase64Message"]()
          : m["shared.argon2Tools.hashHashErrorMessage"]({});
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (!busy && !result) {
    return (
      <Empty className="min-h-64 border border-border bg-default/20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Lock aria-hidden className="size-5 text-muted" />
          </EmptyMedia>
          <EmptyTitle>
            {m["shared.argon2Tools.hashEmptyStateTitle"]({})}
          </EmptyTitle>
          <EmptyDescription>
            {m["shared.argon2Tools.hashEmptyStateDescription"]({})}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-default/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-medium">
          {m["shared.argon2Tools.hashEncodedHashLabel"]({})}
        </h3>
        <ToolCopyButton
          key={result?.hash ?? "pending"}
          value={result?.hash ?? ""}
          copyLabel={m["common.argonCopy"]({})}
          copiedLabel={m["common.actions.copied"]({})}
          ariaLabel={m["shared.argon2Tools.hashEncodedHashLabel"]({})}
          disabled={busy || !result}
          size="icon-sm"
        />
      </div>
      <div className="relative min-h-32">
        {result ? (
          <output
            className={`block font-mono text-xs leading-6 break-all transition-opacity sm:text-sm ${
              busy ? "opacity-30" : ""
            }`}
          >
            {result.hash}
          </output>
        ) : null}
        {busy ? (
          <div
            role="status"
            aria-label={m["shared.shortId.busy"]({})}
            className={`grid gap-3 ${result ? "absolute inset-0" : ""}`}
          >
            <span className="sr-only">{m["shared.shortId.busy"]({})}</span>
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-11/12 rounded" />
            <Skeleton className="h-3 w-5/6 rounded" />
            <Skeleton className="h-3 w-4/5 rounded" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HashArticle() {
  return (
    <ToolArticle>
      <h2>{m["shared.argon2Tools.hashArticleWhatTitle"]({})}</h2>
      <p>{m["shared.argon2Tools.hashArticleWhatBody"]({})}</p>
      <p>
        <strong>{m["shared.argon2Tools.hashArticleWhyTitle"]({})}</strong>
      </p>
      <ul>
        {[
          m["shared.argon2Tools.hashArticleWhyItems0"]({}),
          m["shared.argon2Tools.hashArticleWhyItems1"]({}),
          m["shared.argon2Tools.hashArticleWhyItems2"]({}),
          m["shared.argon2Tools.hashArticleWhyItems3"]({}),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        <strong>{m["shared.argon2Tools.hashArticleHowTitle"]({})}</strong>
      </p>
      <ol>
        {[
          m["shared.argon2Tools.hashArticleHowItems0"]({}),
          m["shared.argon2Tools.hashArticleHowItems1"]({}),
          m["shared.argon2Tools.hashArticleHowItems2"]({}),
          m["shared.argon2Tools.hashArticleHowItems3"]({}),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p>
        <strong>{m["shared.argon2Tools.hashArticleSecurityTitle"]({})}</strong>
      </p>
      <ul>
        {[
          m["shared.argon2Tools.hashArticleSecurityItems0"]({}),
          m["shared.argon2Tools.hashArticleSecurityItems1"]({}),
          m["shared.argon2Tools.hashArticleSecurityItems2"]({}),
          m["shared.argon2Tools.hashArticleSecurityItems3"]({}),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function Argon2HashPasswordPageContent() {
  const locale = getLocale();
  const id = useId();
  const worker = useArgonTask();
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [salt, setSalt] = useState("");
  const [algorithm, setAlgorithm] = useState<Algorithm>(DEFAULTS.algorithm);
  const [numbers, setNumbers] = useState<NumericInputs>(initialNumbers);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ArgonResult | null>(null);
  const [error, setError] = useState<ArgonErrorCode | "">("");

  const numericState = Object.fromEntries(
    numericFields.map((field) => [
      field,
      parseNumericInput(numbers[field], field),
    ]),
  ) as Record<NumericField, { value: number; valid: boolean }>;
  const memoryDependencyValid =
    numericState.memorySize.valid &&
    numericState.parallelism.valid &&
    numericState.memorySize.value >= numericState.parallelism.value * 8;
  const saltValidation = validateSalt(salt);
  const canGenerate =
    !busy &&
    password.length > 0 &&
    !saltValidation &&
    numericFields.every((field) => numericState[field].valid) &&
    memoryDependencyValid;
  const memoryEstimate = numericState.memorySize.valid
    ? `${(numericState.memorySize.value / 1024).toLocaleString(locale, {
        maximumFractionDigits: 3,
      })} MiB`
    : "—";

  function invalidate() {
    worker.abort();
    setBusy(false);
    setResult(null);
    setError("");
  }

  function changeNumber(field: NumericField, value: string) {
    invalidate();
    setNumbers((current) => ({ ...current, [field]: value }));
  }

  function generateSalt() {
    invalidate();
    try {
      setSalt(randomSalt());
    } catch {
      setError("random_failed");
    }
  }

  useEffect(() => {
    const storedAlgorithm = safeLocalStorage.getItem(storageKeys.algorithm);
    if (
      storedAlgorithm === "argon2id" ||
      storedAlgorithm === "argon2i" ||
      storedAlgorithm === "argon2d"
    ) {
      setAlgorithm(storedAlgorithm);
    }
    setNumbers((current) => {
      const next = { ...current };
      for (const field of numericFields) {
        next[field] =
          safeLocalStorage.getItem(storageKeys[field]) ?? next[field];
      }
      return next;
    });
    try {
      setSalt(randomSalt());
    } catch {
      setError("random_failed");
    }
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(storageKeys.algorithm, algorithm);
    for (const field of numericFields) {
      safeLocalStorage.setItem(storageKeys[field], numbers[field]);
    }
  }, [algorithm, numbers]);

  async function submit() {
    if (!canGenerate) {
      setError(
        password.length === 0
          ? "invalid_input"
          : saltValidation
            ? "invalid_salt"
            : "invalid_parameters",
      );
      return;
    }
    const { controller, current } = worker.start();
    setBusy(true);
    setError("");
    try {
      const next = await runArgon(
        {
          kind: "hash",
          password,
          secret,
          salt,
          algorithm,
          iterations: numericState.iterations.value,
          memorySize: numericState.memorySize.value,
          parallelism: numericState.parallelism.value,
          hashLength: numericState.hashLength.value,
        },
        controller.signal,
      );
      if (worker.isCurrent(controller, current)) setResult(next);
    } catch (cause) {
      if (worker.isCurrent(controller, current)) {
        setResult(null);
        setError(cause instanceof ArgonError ? cause.code : "worker_failed");
      }
    } finally {
      if (worker.isCurrent(controller, current)) setBusy(false);
      worker.finish(controller);
    }
  }

  return (
    <div className="grid gap-10">
      <form
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)] xl:items-start"
        data-tool-panels
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-6">
          <ToolPanelCard>
            <PanelHeader
              title={m["shared.argon2Tools.hashConfigurationLabel"]({})}
            />
            <ToolPanelCardContent className="gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <PasswordField
                  id={`${id}-password`}
                  name="password"
                  label={m["shared.aesTools.decryptpasswordlabel"]({})}
                  placeholder={m["shared.argon2Tools.hashPasswordPlaceholder"](
                    {},
                  )}
                  value={password}
                  visible={showPassword}
                  showLabel={m["shared.aesTools.showpassword"]({})}
                  hideLabel={m["shared.aesTools.hidepassword"]({})}
                  onChange={(value) => {
                    invalidate();
                    setPassword(value);
                  }}
                  onToggle={() => setShowPassword((current) => !current)}
                />
                <AlgorithmSelect
                  id={`${id}-algorithm`}
                  label={m["common.argonAlgorithm"]({})}
                  value={algorithm}
                  onChange={(next) => {
                    invalidate();
                    setAlgorithm(next);
                  }}
                />
              </div>
              <PasswordField
                id={`${id}-secret`}
                name="secret"
                label={m["shared.argon2Tools.hashSecretLabel"]({})}
                description={m["shared.argon2Tools.hashSecretDescription"]({})}
                placeholder={m["shared.argon2Tools.hashSecretPlaceholder"]({})}
                value={secret}
                visible={showSecret}
                showLabel={m["shared.argon2Tools.verifierShowSecretLabel"]({})}
                hideLabel={m["shared.argon2Tools.verifierHideSecretLabel"]({})}
                onChange={(value) => {
                  invalidate();
                  setSecret(value);
                }}
                onToggle={() => setShowSecret((current) => !current)}
              />
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <PanelHeader
              title={m["shared.argon2Tools.hashParametersLabel"]({})}
              description={m["shared.argon2Tools.hashParametersDescription"](
                {},
              )}
            />
            <ToolPanelCardContent className="gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {numericFields.map((field) => (
                  <Field
                    key={field}
                    id={`${id}-${field}`}
                    label={
                      field === "iterations"
                        ? m["common.argonIterations"]()
                        : field === "memorySize"
                          ? m["shared.argon2Tools.hashMemorySizeLabel"]()
                          : field === "parallelism"
                            ? m["shared.argon2Tools.hashParallelismLabel"]()
                            : m["shared.argon2Tools.hashHashLengthLabel"]()
                    }
                    error={
                      numericState[field].valid &&
                      (field !== "memorySize" || memoryDependencyValid)
                        ? undefined
                        : field === "iterations"
                          ? m[
                              "shared.argon2Tools.hashIterationsInvalidMessage"
                            ]()
                          : field === "memorySize" && !numericState[field].valid
                            ? m[
                                "shared.argon2Tools.hashMemorySizeInvalidMessage"
                              ]()
                            : field === "memorySize"
                              ? m[
                                  "shared.argon2Tools.hashMemoryDependencyInvalidMessage"
                                ]()
                              : field === "parallelism"
                                ? m[
                                    "shared.argon2Tools.hashParallelismInvalidMessage"
                                  ]()
                                : m[
                                    "shared.argon2Tools.hashHashLengthInvalidMessage"
                                  ]()
                    }
                  >
                    <Input
                      id={`${id}-${field}`}
                      name={field}
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      variant="secondary"
                      min={numericRanges[field][0]}
                      max={numericRanges[field][1]}
                      step={field === "memorySize" ? 8 : 1}
                      value={numbers[field]}
                      aria-invalid={
                        !numericState[field].valid ||
                        (field === "memorySize" && !memoryDependencyValid)
                      }
                      onChange={(event) =>
                        changeNumber(field, event.target.value)
                      }
                    />
                  </Field>
                ))}
              </div>
              <p className="text-sm text-muted">
                {m["shared.argon2Tools.hashEstimatedMemoryLabel"]({})}:{" "}
                {memoryEstimate}
              </p>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <PanelHeader
              title={m["shared.argon2Tools.hashSaltLabel"]({})}
              description={m["shared.argon2Tools.hashSaltDescription"]({})}
            />
            <ToolPanelCardContent className="py-4">
              <Field
                id={`${id}-salt`}
                label={m["shared.argon2Tools.hashSaltLabel"]({})}
                error={
                  saltValidation
                    ? saltValidation === "base64"
                      ? m["shared.argon2Tools.hashSaltInvalidBase64Message"]()
                      : m["shared.argon2Tools.hashSaltTooShortMessage"]({})
                    : undefined
                }
              >
                <Input
                  id={`${id}-salt`}
                  name="salt"
                  placeholder={m["shared.argon2Tools.hashSaltLabel"]({})}
                  autoComplete="off"
                  spellCheck={false}
                  variant="secondary"
                  className="font-mono text-sm"
                  value={salt}
                  aria-invalid={Boolean(saltValidation)}
                  onChange={(event) => {
                    invalidate();
                    setSalt(event.target.value);
                  }}
                />
              </Field>
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="justify-start">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={generateSalt}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.argonRandom"]({})}
              </Button>
            </ToolPanelCardFooter>
          </ToolPanelCard>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <ToolPanelCard>
            <PanelHeader
              title={m["common.adler32hashresultlabel"]({})}
              description={m["shared.argon2Tools.hashHashResultDescription"](
                {},
              )}
              actions={
                <>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isDisabled={!canGenerate}
                  >
                    {busy ? (
                      <Spinner size="sm" />
                    ) : (
                      <Lock aria-hidden className="size-4" />
                    )}
                    {busy
                      ? m["shared.shortId.busy"]({})
                      : m["common.argonGenerate"]({})}
                  </Button>
                  <ToolCopyButton
                    key={result?.hash ?? "empty"}
                    value={result?.hash ?? ""}
                    copyLabel={m["common.argonCopy"]({})}
                    copiedLabel={m["common.actions.copied"]({})}
                    disabled={!result || busy}
                  />
                </>
              }
            />
            <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
              <ResultContent busy={busy} error={error} result={result} />
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </form>
      <HashArticle />
    </div>
  );
}

export default function Argon2HashPasswordPage() {
  return (
    <ToolPage>
      <Argon2HashPasswordPageContent />
    </ToolPage>
  );
}
