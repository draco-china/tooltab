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
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import {
  KdfError,
  type KdfErrorCode,
  type KdfResult,
  MAX_SALT,
  randomSalt,
  type SaltFormat,
} from "@workspace/tools/crypto/kdf";
import { runKdf } from "@/features/tools/kdf-tools/worker-client";
import { useAsyncTask } from "@/hooks/use-async-task";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatFileSize } from "@/lib/file-size";
import { safeLocalStorage } from "@/lib/safe-storage";
import { getLocale } from "@/paraglide/runtime.js";
import { m } from "@/paraglide/messages.js";

const DEFAULTS = {
  costFactor: "16384",
  blockSize: "8",
  parallelism: "1",
  length: "32",
} as const;
const SALT_FORMATS = [
  ["utf-8", "UTF-8"],
  ["hex", "Hex"],
  ["base64", "Base64"],
] as const;
const STORAGE_KEYS = {
  saltFormat: "tools:scrypt-key-derivation:salt-format",
  costFactor: "tools:scrypt-key-derivation:cost-factor",
  blockSize: "tools:scrypt-key-derivation:block-size",
  parallelism: "tools:scrypt-key-derivation:parallelism",
  length: "tools:scrypt-key-derivation:length",
} as const;

type DerivedState =
  | { status: "idle" }
  | { status: "loading"; result: KdfResult | null }
  | { status: "ready"; result: KdfResult }
  | { status: "error"; code: KdfErrorCode };
type Validation = { value: number; valid: boolean };
type CostValidation = Validation & {
  error: "" | "range" | "power" | "memory";
};

function parseInteger(
  input: string,
  minimum: number,
  maximum: number,
  fallback: number,
): Validation {
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

function parseCost(input: string, blockSize: number): CostValidation {
  const parsed = parseInteger(input, 2, 524_288, 16_384);
  if (!parsed.valid) return { ...parsed, error: "range" };
  if ((parsed.value & (parsed.value - 1)) !== 0)
    return { ...parsed, valid: false, error: "power" };
  if (
    128 * parsed.value * blockSize > 64 * 1024 * 1024 ||
    (blockSize === 1 && parsed.value >= 65_536)
  )
    return { ...parsed, valid: false, error: "memory" };
  return { ...parsed, error: "" };
}

function invalidSalt(
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
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const valid =
      btoa(binary).replace(/=+$/, "") === normalized.replace(/=+$/, "");
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

function ScryptKeyDerivationPageContent() {
  const locale = getLocale();
  const ids = {
    password: useId(),
    saltFormat: useId(),
    costFactor: useId(),
    blockSize: useId(),
    parallelism: useId(),
    length: useId(),
    salt: useId(),
  };
  const [password, setPassword] = useState("");
  const [saltText, setSaltText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saltFormat, setSaltFormat] = useState<SaltFormat>("utf-8");
  const [costFactorInput, setCostFactorInput] = useState<string>(
    DEFAULTS.costFactor,
  );
  const [blockSizeInput, setBlockSizeInput] = useState<string>(
    DEFAULTS.blockSize,
  );
  const [parallelismInput, setParallelismInput] = useState<string>(
    DEFAULTS.parallelism,
  );
  const [lengthInput, setLengthInput] = useState<string>(DEFAULTS.length);
  const [fileError, setFileError] = useState<KdfErrorCode | "">("");
  const task = useAsyncTask(runKdf);
  const { run, clear } = task;
  const [generationError, setGenerationError] = useState<KdfErrorCode | "">("");

  const blockSize = parseInteger(blockSizeInput, 1, 64, 8);
  const costFactor = parseCost(costFactorInput, blockSize.value);
  const parallelism = parseInteger(parallelismInput, 1, 32, 1);
  const length = parseInteger(lengthInput, 16, 256, 32);
  const saltError = invalidSalt(saltText, file, saltFormat);
  const pendingInput = useMemo(
    () => ({
      password,
      saltText,
      file,
      saltFormat,
      costFactorInput,
      blockSizeInput,
      parallelismInput,
      lengthInput,
      fileError,
    }),
    [
      blockSizeInput,
      costFactorInput,
      file,
      fileError,
      lengthInput,
      parallelismInput,
      password,
      saltFormat,
      saltText,
    ],
  );
  const input = useDebouncedValue(pendingInput);
  const [startedInput, setStartedInput] = useState(pendingInput);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset must run when the debounced input identity changes.
  useEffect(() => {
    clear();
    setGenerationError("");
  }, [pendingInput, clear]);

  useEffect(() => {
    const storedFormat = safeLocalStorage.getItem(STORAGE_KEYS.saltFormat);
    if (SALT_FORMATS.some(([value]) => value === storedFormat))
      setSaltFormat(storedFormat as SaltFormat);
    setCostFactorInput(
      safeLocalStorage.getItem(STORAGE_KEYS.costFactor) ?? DEFAULTS.costFactor,
    );
    setBlockSizeInput(
      safeLocalStorage.getItem(STORAGE_KEYS.blockSize) ?? DEFAULTS.blockSize,
    );
    setParallelismInput(
      safeLocalStorage.getItem(STORAGE_KEYS.parallelism) ??
        DEFAULTS.parallelism,
    );
    setLengthInput(
      safeLocalStorage.getItem(STORAGE_KEYS.length) ?? DEFAULTS.length,
    );
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.saltFormat, saltFormat);
    safeLocalStorage.setItem(STORAGE_KEYS.costFactor, costFactorInput);
    safeLocalStorage.setItem(STORAGE_KEYS.blockSize, blockSizeInput);
    safeLocalStorage.setItem(STORAGE_KEYS.parallelism, parallelismInput);
    safeLocalStorage.setItem(STORAGE_KEYS.length, lengthInput);
  }, [
    blockSizeInput,
    costFactorInput,
    lengthInput,
    parallelismInput,
    saltFormat,
  ]);

  useEffect(() => {
    setStartedInput(input);
    const nextBlockSize = parseInteger(input.blockSizeInput, 1, 64, 8);
    const nextCostFactor = parseCost(
      input.costFactorInput,
      nextBlockSize.value,
    );
    const nextParallelism = parseInteger(input.parallelismInput, 1, 32, 1);
    const nextLength = parseInteger(input.lengthInput, 16, 256, 32);
    const nextSaltError = invalidSalt(
      input.saltText,
      input.file,
      input.saltFormat,
    );
    const saltSource =
      input.file ?? (input.saltText.trim() ? input.saltText : null);
    if (
      !input.password ||
      !saltSource ||
      nextSaltError ||
      !nextCostFactor.valid ||
      !nextBlockSize.valid ||
      !nextParallelism.valid ||
      !nextLength.valid ||
      input.fileError
    ) {
      clear();
      return;
    }

    void run({
      kind: "scrypt",
      password: input.password,
      salt: saltSource,
      saltFormat: input.saltFormat,
      costFactor: nextCostFactor.value,
      blockSize: nextBlockSize.value,
      parallelism: nextParallelism.value,
      lengthBytes: nextLength.value,
    });
    return clear;
  }, [input, run, clear]);

  const state: DerivedState = generationError
    ? { status: "error", code: generationError }
    : fileError
      ? { status: "error", code: fileError }
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

  function generateSalt() {
    try {
      const salt = randomSalt(saltFormat);
      clear();
      setGenerationError("");
      setFileError("");
      setFile(null);
      setSaltText(salt);
    } catch {
      clear();
      setGenerationError("random_failed");
    }
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
                {m["shared.addressTools.password"]()}
              </Label>
              <ToolPasswordInput
                id={ids.password}
                value={password}
                placeholder={m["shared.addressTools.password"]()}
                showLabel={m["shared.aesTools.showpassword"]()}
                hideLabel={m["shared.aesTools.hidepassword"]()}
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <ChoiceField
              id={ids.saltFormat}
              label={m["tools.pbkdf2KeyDerivation.saltFormatLabel"]()}
              value={saltFormat}
              onChange={(value) => setSaltFormat(value as SaltFormat)}
            />
            <NumberField
              id={ids.costFactor}
              label={m["tools.scryptKeyDerivation.costFactorLabel"]()}
              value={costFactorInput}
              minimum={2}
              maximum={524_288}
              valid={costFactor.valid}
              error={
                costFactor.error === "power"
                  ? m[
                      "tools.scryptKeyDerivation.costFactorPowerInvalidMessage"
                    ]()
                  : costFactor.error === "memory"
                    ? m[
                        "tools.scryptKeyDerivation.costFactorMemoryInvalidMessage"
                      ]()
                    : m[
                        "tools.scryptKeyDerivation.costFactorRangeInvalidMessage"
                      ]()
              }
              onChange={setCostFactorInput}
            />
            <NumberField
              id={ids.blockSize}
              label={m["tools.scryptKeyDerivation.blockSizeLabel"]()}
              value={blockSizeInput}
              minimum={1}
              maximum={64}
              valid={blockSize.valid}
              error={m["tools.scryptKeyDerivation.blockSizeInvalidMessage"]()}
              onChange={setBlockSizeInput}
            />
            <NumberField
              id={ids.parallelism}
              label={m["tools.scryptKeyDerivation.parallelismLabel"]()}
              value={parallelismInput}
              minimum={1}
              maximum={32}
              valid={parallelism.valid}
              error={m["tools.scryptKeyDerivation.parallelismInvalidMessage"]()}
              onChange={setParallelismInput}
            />
            <NumberField
              id={ids.length}
              label={m["tools.pbkdf2KeyDerivation.lengthLabel"]()}
              value={lengthInput}
              minimum={16}
              maximum={256}
              valid={length.valid}
              error={m["tools.scryptKeyDerivation.lengthInvalidMessage"]()}
              onChange={setLengthInput}
            />
            <p className="text-sm text-muted sm:col-span-2">
              {m["tools.scryptKeyDerivation.argonEstimatedMemory"]()}:{" "}
              {formatMemory(costFactor.value, blockSize.value, locale)}
            </p>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["shared.bcrypt.salt"]()}</Card.Title>
            <Card.Description>
              {file
                ? `${file.name} • ${formatFileSize(file.size, locale)}`
                : m["tools.scryptKeyDerivation.saltDescription"]()}
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
                      ? m["tools.scryptKeyDerivation.saltInvalidHexMessage"]()
                      : m["shared.argon2Tools.hashSaltInvalidBase64Message"]()}
                  </p>
                ) : null}
              </div>
            ) : null}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              description={m["tools.scryptKeyDerivation.saltDescription"]()}
              fileName={
                file
                  ? `${file.name} • ${formatFileSize(file.size, locale)}`
                  : undefined
              }
              clearLabel={m["common.adler32plaintextlabel"]()}
              onSelect={(nextFile) => {
                setFileError("");
                if (nextFile.size > MAX_SALT) {
                  setFile(null);
                  setFileError("resource_limit");
                } else setFile(nextFile);
              }}
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
          <ToolPanelCardFooter>
            <ToolPanelActionGroup>
              <Button type="button" variant="ghost" onPress={generateSalt}>
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.argonRandom"]()}
              </Button>
            </ToolPanelActionGroup>
          </ToolPanelCardFooter>
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
                  : m["tools.scryptKeyDerivation.derivedKeyDescription"]()}
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
        <h2>{m["tools.scryptKeyDerivation.articleTitle"]()}</h2>
        <p>{m["tools.scryptKeyDerivation.articleIntro"]()}</p>
        <p>
          <strong>{m["tools.nanoidGenerator.article.keyPointsTitle"]()}</strong>
        </p>
        <ul>
          <li>{m["tools.scryptKeyDerivation.articleKeyPoints0"]()}</li>
          <li>{m["tools.scryptKeyDerivation.articleKeyPoints1"]()}</li>
          <li>{m["tools.scryptKeyDerivation.articleKeyPoints2"]()}</li>
        </ul>
        <p>
          <strong>
            {m["tools.pbkdf2KeyDerivation.article.bestPracticesTitle"]()}
          </strong>
        </p>
        <ul>
          <li>{m["tools.scryptKeyDerivation.articleBestPractices0"]()}</li>
          <li>{m["tools.scryptKeyDerivation.articleBestPractices1"]()}</li>
          <li>{m["tools.scryptKeyDerivation.articleBestPractices2"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

function ChoiceField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: SaltFormat;
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
            {SALT_FORMATS.map(([option, optionLabel]) => (
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

function NumberField({
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
        {m["tools.scryptKeyDerivation.emptyStateDescription"]()}
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
      {(["hex", "base64"] as const).map((format) => {
        const value = state.result?.[format] ?? "";
        return (
          <section
            key={format}
            className="grid gap-3 rounded-xl border border-border bg-default/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">
                {format === "hex"
                  ? m["tools.scryptKeyDerivation.hexLabel"]()
                  : m["common.uuidiBase64"]()}
              </h3>
              <ToolCopyButton
                key={`${format}-${value}-${state.status}`}
                value={value}
                copyLabel={m["common.actions.copyResult"]()}
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

function formatMemory(costFactor: number, blockSize: number, locale: string) {
  const bytes = 128 * costFactor * blockSize;
  if (bytes < 1024 * 1024)
    return `${Math.round(bytes / 1024).toLocaleString(locale)} KiB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(locale, {
    maximumFractionDigits: 1,
  })} MiB`;
}

export default function ScryptKeyDerivationPage() {
  return (
    <ToolPage>
      <ScryptKeyDerivationPageContent />
    </ToolPage>
  );
}
