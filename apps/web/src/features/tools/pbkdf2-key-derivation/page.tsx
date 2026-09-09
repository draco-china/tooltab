import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Spinner,
} from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import {
  type Hash,
  KdfError,
  type KdfErrorCode,
  type KdfResult,
  MAX_SALT,
  type SaltFormat,
} from "@workspace/tools/crypto/kdf";
import { runKdf } from "@/features/tools/kdf-tools/worker-client";
import { useAsyncTask } from "@/hooks/use-async-task";
import { formatFileSize } from "@/lib/file-size";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

const DEFAULT_ITERATIONS = "100000";
const DEFAULT_LENGTH = "32";
const HASHES = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
const SALT_FORMATS = [
  ["utf-8", "UTF-8"],
  ["hex", "Hex"],
  ["base64", "Base64"],
] as const;
const STORAGE_KEYS = {
  algorithm: "tools:pbkdf2-key-derivation:algorithm",
  saltFormat: "tools:pbkdf2-key-derivation:salt-format",
  iterations: "tools:pbkdf2-key-derivation:iterations",
  length: "tools:pbkdf2-key-derivation:length",
} as const;

type DerivedState =
  | { status: "idle" }
  | { status: "loading"; result: KdfResult | null }
  | { status: "ready"; result: KdfResult }
  | { status: "error"; code: KdfErrorCode };

function parseIntegerRange(
  input: string,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const value = input.trim();
  if (!value) return { value: fallback, valid: true };
  if (!/^\d+$/.test(value)) return { value: fallback, valid: false };
  const parsed = Number(value);
  return {
    value: parsed,
    valid:
      Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum,
  };
}

function invalidSaltFormat(
  value: string,
  file: File | null,
  format: SaltFormat,
): "" | "hex" | "base64" {
  if (file || !value.trim()) return "";
  if (format === "hex") return /^(?:[\da-fA-F]{2})+$/.test(value) ? "" : "hex";
  if (format !== "base64") return "";
  const normalized = value
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  try {
    if (
      !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) ||
      normalized.length % 4 === 1
    )
      return "base64";
    const bytes = Uint8Array.from(atob(normalized), (character) =>
      character.charCodeAt(0),
    );
    let canonical = "";
    for (const byte of bytes) canonical += String.fromCharCode(byte);
    const valid =
      btoa(canonical).replace(/=+$/, "") === normalized.replace(/=+$/, "");
    bytes.fill(0);
    return valid ? "" : "base64";
  } catch {
    return "base64";
  }
}

function errorMessage(code: KdfErrorCode) {
  if (code === "resource_limit")
    return m["tools.pbkdf2KeyDerivation.statesResourceLimit"]();
  if (code === "invalid_input")
    return m["tools.pbkdf2KeyDerivation.statesInvalidInput"]();
  if (code === "timeout") return m["tools.pbkdf2KeyDerivation.statesTimeout"]();
  return m["tools.pbkdf2KeyDerivation.statesWorkerFailed"]();
}

function Pbkdf2KeyDerivationPageContent() {
  const locale = getLocale();
  const ids = {
    password: useId(),
    algorithm: useId(),
    saltFormat: useId(),
    iterations: useId(),
    length: useId(),
    salt: useId(),
    file: useId(),
  };
  const [password, setPassword] = useState("");
  const [saltText, setSaltText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [algorithm, setAlgorithm] = useState<Hash>("SHA-256");
  const [saltFormat, setSaltFormat] = useState<SaltFormat>("utf-8");
  const [iterationsInput, setIterationsInput] = useState(DEFAULT_ITERATIONS);
  const [lengthInput, setLengthInput] = useState(DEFAULT_LENGTH);
  const [fileError, setFileError] = useState<KdfErrorCode | "">("");
  const iterations = parseIntegerRange(iterationsInput, 1, 1_000_000, 100000);
  const length = parseIntegerRange(lengthInput, 16, 256, 32);
  const task = useAsyncTask(runKdf);
  const { run, clear } = task;
  const pendingInput = useMemo(
    () => ({
      password,
      saltText,
      file,
      algorithm,
      saltFormat,
      iterationsInput,
      lengthInput,
      fileError,
    }),
    [
      algorithm,
      file,
      fileError,
      iterationsInput,
      lengthInput,
      password,
      saltFormat,
      saltText,
    ],
  );
  const input = useDeferredValue(pendingInput);
  const [startedInput, setStartedInput] = useState(pendingInput);
  const saltError = useMemo(
    () => invalidSaltFormat(input.saltText, input.file, input.saltFormat),
    [input.saltText, input.file, input.saltFormat],
  );

  useEffect(() => {
    const storedAlgorithm = safeLocalStorage.getItem(STORAGE_KEYS.algorithm);
    const storedSaltFormat = safeLocalStorage.getItem(STORAGE_KEYS.saltFormat);
    if (HASHES.includes(storedAlgorithm as Hash))
      setAlgorithm(storedAlgorithm as Hash);
    if (SALT_FORMATS.some(([value]) => value === storedSaltFormat))
      setSaltFormat(storedSaltFormat as SaltFormat);
    setIterationsInput(
      safeLocalStorage.getItem(STORAGE_KEYS.iterations) ?? DEFAULT_ITERATIONS,
    );
    setLengthInput(
      safeLocalStorage.getItem(STORAGE_KEYS.length) ?? DEFAULT_LENGTH,
    );
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.algorithm, algorithm);
    safeLocalStorage.setItem(STORAGE_KEYS.saltFormat, saltFormat);
    safeLocalStorage.setItem(STORAGE_KEYS.iterations, iterationsInput);
    safeLocalStorage.setItem(STORAGE_KEYS.length, lengthInput);
  }, [algorithm, iterationsInput, lengthInput, saltFormat]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset must run when the debounced input identity changes.
  useEffect(() => {
    clear();
  }, [pendingInput, clear]);

  useEffect(() => {
    setStartedInput(input);
    const nextIterations = parseIntegerRange(
      input.iterationsInput,
      1,
      1_000_000,
      100000,
    );
    const nextLength = parseIntegerRange(input.lengthInput, 16, 256, 32);
    const saltSource =
      input.file ?? (input.saltText.trim() ? input.saltText : null);
    if (
      !input.password ||
      !saltSource ||
      saltError ||
      !nextIterations.valid ||
      !nextLength.valid ||
      input.fileError
    ) {
      clear();
      return;
    }

    void run({
      kind: "pbkdf2",
      password: input.password,
      salt: saltSource,
      saltFormat: input.saltFormat,
      iterations: nextIterations.value,
      lengthBytes: nextLength.value,
      hash: input.algorithm,
    });
    return clear;
  }, [input, saltError, run, clear]);

  const state: DerivedState = pendingInput.fileError
    ? { status: "error", code: pendingInput.fileError }
    : startedInput !== pendingInput || task.status === "running"
      ? { status: "loading", result: null }
      : task.status === "success"
        ? { status: "ready", result: task.result }
        : task.status === "error"
          ? {
              status: "error",
              code:
                task.error instanceof KdfError
                  ? task.error.code
                  : "worker_failed",
            }
          : { status: "idle" };

  function selectFile(nextFile: File) {
    setFileError("");
    if (nextFile.size > MAX_SALT) {
      setFile(null);
      setFileError("resource_limit");
      return;
    }
    setFile(nextFile);
  }

  return (
    <div className="grid gap-10">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.highwayhashHashTextOrFile.configurationLabel"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={ids.password}>
                {m["shared.aesTools.decryptpasswordlabel"]()}
              </Label>
              <ToolPasswordInput
                id={ids.password}
                value={password}
                placeholder={m["shared.aesTools.decryptpasswordlabel"]()}
                showLabel={m["shared.aesTools.showpassword"]()}
                hideLabel={m["shared.aesTools.hidepassword"]()}
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <ChoiceField
              id={ids.algorithm}
              label={m["common.argonAlgorithm"]()}
              value={algorithm}
              options={HASHES.map((value) => [value, value] as const)}
              onChange={(value) => setAlgorithm(value as Hash)}
            />
            <ChoiceField
              id={ids.saltFormat}
              label={m["tools.pbkdf2KeyDerivation.saltFormatLabel"]()}
              value={saltFormat}
              options={SALT_FORMATS}
              onChange={(value) => setSaltFormat(value as SaltFormat)}
            />
            <NumberInput
              id={ids.iterations}
              label={m["common.argonIterations"]()}
              value={iterationsInput}
              minimum={1}
              maximum={1_000_000}
              valid={iterations.valid}
              error={m["tools.pbkdf2KeyDerivation.iterationsInvalidMessage"]()}
              onChange={setIterationsInput}
            />
            <div className="sm:col-span-2">
              <NumberInput
                id={ids.length}
                label={m["tools.pbkdf2KeyDerivation.lengthLabel"]()}
                value={lengthInput}
                minimum={16}
                maximum={256}
                valid={length.valid}
                error={m["tools.pbkdf2KeyDerivation.lengthInvalidMessage"]()}
                onChange={setLengthInput}
              />
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["shared.bcrypt.salt"]()}</Card.Title>
            <Card.Description>
              {file
                ? `${file.name} • ${formatFileSize(file.size, locale)}`
                : m["tools.pbkdf2KeyDerivation.saltDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="grid gap-4 py-4">
            {!file ? (
              <div className="grid gap-2">
                <Input
                  id={ids.salt}
                  aria-label={m["shared.bcrypt.salt"]()}
                  placeholder={m["shared.bcrypt.salt"]()}
                  spellCheck={false}
                  autoComplete="off"
                  value={saltText}
                  aria-invalid={Boolean(saltError)}
                  onChange={(event) => {
                    setFileError("");
                    setSaltText(event.target.value);
                  }}
                  className="min-h-11 font-mono text-sm"
                />
                {saltError ? (
                  <p role="alert" className="text-sm text-danger">
                    {saltError === "hex"
                      ? m["tools.pbkdf2KeyDerivation.saltInvalidHexMessage"]()
                      : m["shared.argon2Tools.hashSaltInvalidBase64Message"]()}
                  </p>
                ) : null}
              </div>
            ) : null}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              description={m["tools.pbkdf2KeyDerivation.saltDescription"]()}
              fileName={
                file
                  ? `${file.name} • ${formatFileSize(file.size, locale)}`
                  : undefined
              }
              clearLabel={m["common.adler32plaintextlabel"]()}
              onSelect={selectFile}
              onClear={() => {
                setFile(null);
                setFileError("");
              }}
            />
            {fileError ? (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(fileError)}
              </p>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>
                {m["tools.pbkdf2KeyDerivation.derivedKeyLabel"]()}
              </Card.Title>
              <Card.Description>
                {file
                  ? `${file.name} • ${formatFileSize(file.size, locale)}`
                  : m["tools.pbkdf2KeyDerivation.derivedKeyDescription"]()}
              </Card.Description>
            </div>
            {state.status === "loading" ? <Spinner size="sm" /> : null}
          </Card.Header>
          <ToolPanelCardContent className="py-4" aria-live="polite">
            <DerivedKeySection state={state} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.pbkdf2KeyDerivation.articleTitle"]()}</h2>
        <p>{m["tools.pbkdf2KeyDerivation.articleIntro"]()}</p>
        <p>
          <strong>{m["tools.nanoidGenerator.article.keyPointsTitle"]()}</strong>
        </p>
        <ul>
          {[
            m["tools.pbkdf2KeyDerivation.articleKeyPoints0"](),
            m["tools.pbkdf2KeyDerivation.articleKeyPoints1"](),
            m["tools.pbkdf2KeyDerivation.articleKeyPoints2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          <strong>
            {m["tools.pbkdf2KeyDerivation.article.bestPracticesTitle"]()}
          </strong>
        </p>
        <ul>
          {[
            m["tools.pbkdf2KeyDerivation.articleBestPractices0"](),
            m["tools.pbkdf2KeyDerivation.articleBestPractices1"](),
            m["tools.pbkdf2KeyDerivation.articleBestPractices2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function Pbkdf2KeyDerivationPage() {
  return (
    <ToolPage>
      <Pbkdf2KeyDerivationPageContent />
    </ToolPage>
  );
}

function ChoiceField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key));
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id} className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Section>
            {options.map(([option, optionLabel]) => (
              <ListBox.Item key={option} id={option} textValue={optionLabel}>
                {optionLabel}
              </ListBox.Item>
            ))}
          </ListBox.Section>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function NumberInput({
  id,
  label,
  value,
  minimum,
  maximum,
  valid,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  minimum: number;
  maximum: number;
  valid: boolean;
  error: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={minimum}
        max={maximum}
        step={1}
        value={value}
        aria-invalid={!valid}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11"
      />
      {!valid ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DerivedKeySection({ state }: { state: DerivedState }) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
        {m["tools.pbkdf2KeyDerivation.emptyStateDescription"]()}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>{errorMessage(state.code)}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <div className="grid gap-3">
      {(
        [
          ["hex", m["common.adler32hexlabel"]()],
          ["base64", m["common.adler32base64label"]()],
        ] as const
      ).map(([format, label]) => {
        const value = state.result?.[format] ?? "";
        return (
          <section
            key={format}
            className="grid gap-3 rounded-xl border border-border bg-default/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{label}</h3>
              <ToolCopyButton
                key={`${format}-${value}-${state.status}`}
                value={value}
                copyLabel={m["common.adler32copyresultlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={state.status === "loading"}
              />
            </div>
            <OutputValue value={value} loading={state.status === "loading"} />
          </section>
        );
      })}
    </div>
  );
}

function OutputValue({ value, loading }: { value: string; loading: boolean }) {
  return (
    <div className="relative min-h-18">
      {value ? (
        <code
          className={`block text-xs leading-6 break-all transition-opacity sm:text-sm ${loading ? "opacity-30" : ""}`}
        >
          {value}
        </code>
      ) : null}
      {loading ? (
        <div
          className={`grid gap-2 ${value ? "absolute inset-0" : "min-h-18 content-start"}`}
          aria-hidden
        >
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-11/12 rounded" />
          <Skeleton className="h-3 w-4/5 rounded" />
        </div>
      ) : null}
    </div>
  );
}
