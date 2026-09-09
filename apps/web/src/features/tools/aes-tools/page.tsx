import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextArea,
} from "@heroui/react";
import {
  Download,
  FileJson2,
  FileText,
  Lock,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { formatFileSize } from "@/lib/file-size";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { getLocale } from "@/paraglide/runtime.js";
import { type AesResult, aesDownloadName } from "./jobs";
import {
  AesToolError,
  aesDefaults,
  type EncryptOptions,
  hexBytes,
  KEY_BITS,
  MAX_AES_BYTES,
  MAX_AES_ENVELOPE,
} from "@workspace/tools/crypto/aes";
import { runAesWorker } from "./worker-client";

type SelectedFile = {
  name: string;
  type: string;
  size: number;
  bytes?: Uint8Array;
  json?: string;
};
type CompletedResult = Exclude<AesResult, { kind: "inspected" }>;
type EnvelopeDetails = Extract<AesResult, { kind: "inspected" }>;

function Choice({
  id,
  label,
  value,
  items,
  change,
}: {
  id: string;
  label: string;
  value: string;
  items: Array<{ value: string; label: string }>;
  change: (value: string) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(next) => {
        if (next != null) change(String(next));
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item
              key={item.value}
              id={item.value}
              textValue={item.label}
            >
              {item.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

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

function Notice({
  children,
  title,
  status = "default",
  role,
}: {
  children: string;
  title?: string;
  status?: "default" | "warning" | "danger";
  role?: "alert" | "status";
}) {
  return (
    <Alert status={status} role={role}>
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        {title ? <Alert.Title>{title}</Alert.Title> : null}
        <Alert.Description>{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Lock;
  title: string;
  description: string;
}) {
  return (
    <Empty className="min-h-52 border border-separator bg-default/20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function preview(text: string) {
  return text.slice(
    0,
    /[\uD800-\uDBFF]/.test(text[15999] ?? "") ? 15999 : 16000,
  );
}

function rawKeyIsValid(value: string, keyLengthBits: number) {
  try {
    hexBytes(value, keyLengthBits / 8);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(
  code: AesToolError["code"],
  decrypt: boolean,
  keySource: EncryptOptions["keySource"],
) {
  switch (code) {
    case "invalid_input":
      return decrypt
        ? m["shared.aesTools.decryptvalidationinputrequired"]()
        : m["shared.aesTools.encryptvalidationinputrequired"]();
    case "invalid_envelope":
      return decrypt
        ? m["shared.aesTools.decryptvalidationenvelopeinvalid"]()
        : m["shared.aesTools.encrypterrorinvalidenvelope"]();
    case "invalid_key":
      if (decrypt) {
        return keySource === "raw"
          ? m["shared.aesTools.decryptvalidationrawkeyinvalid"]()
          : m["shared.aesTools.decryptvalidationpasswordrequired"]();
      }
      return keySource === "raw"
        ? m["shared.aesTools.encryptvalidationrawkeyinvalid"]()
        : m["shared.aesTools.encryptvalidationpasswordrequired"]();
    case "invalid_options":
      return decrypt
        ? m["shared.aesTools.decryptvalidationenvelopeinvalid"]()
        : m["shared.aesTools.encryptvalidationiterationsinvalid"]();
    case "decrypt_failed":
      return decrypt
        ? m["shared.aesTools.decrypterrordecryptfailed"]()
        : m["shared.aesTools.encrypterrorinvalidenvelope"]();
    case "invalid_utf8":
      return decrypt
        ? m["shared.aesTools.decrypterrorinvalidutf8"]()
        : m["shared.aesTools.encrypterrorinvalidutf8"]();
    case "too_large":
      return decrypt
        ? m["shared.aesTools.decrypterrortoolarge"]()
        : m["shared.aesTools.encrypterrortoolarge"]();
    case "random_unavailable":
      return decrypt
        ? m["shared.aesTools.decrypterrorrandomunavailable"]()
        : m["shared.aesTools.encrypterrorrandomunavailable"]();
    case "unsupported":
      return decrypt
        ? m["shared.aesTools.decrypterrorunsupported"]()
        : m["shared.aesTools.encrypterrorunsupported"]();
    case "timeout":
      return decrypt
        ? m["shared.aesTools.decrypterrortimeout"]()
        : m["shared.aesTools.encrypterrortimeout"]();
    case "busy":
      return decrypt
        ? m["shared.aesTools.decrypterrorbusy"]()
        : m["shared.aesTools.encrypterrorbusy"]();
    case "artifact_required":
      return decrypt
        ? m["shared.aesTools.decrypterrorartifactrequired"]()
        : m["shared.aesTools.encrypterrorartifactrequired"]();
    case "read_failed":
      return decrypt
        ? m["shared.aesTools.decrypterrorreadfailed"]()
        : m["shared.aesTools.encrypterrorreadfailed"]();
  }
}

export function AesTool({ decrypt = false }: { decrypt?: boolean }) {
  const locale = getLocale();
  const id = useId();
  const [text, setText] = useState("");
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [options, setOptions] = useState<EncryptOptions>({ ...aesDefaults });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rawKey, setRawKey] = useState("");
  const [result, setResult] = useState<CompletedResult | null>(null);
  const [details, setDetails] = useState<EnvelopeDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<AesToolError["code"] | "">("");
  const [inspectionError, setInspectionError] = useState<
    AesToolError["code"] | ""
  >("");
  const [download, setDownload] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const revision = useRef(0);
  const readRevision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const inspectionController = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const url = useRef<string | null>(null);

  const input = decrypt ? (file?.json ?? text) : text;
  const keySource = decrypt
    ? (details?.key.source ?? "password")
    : options.keySource;
  const algorithm = decrypt ? details?.algorithm : `AES-${options.mode}`;
  const requiredBits = decrypt
    ? (details?.key.lengthBits ?? options.keyLengthBits)
    : options.keyLengthBits;
  const rawKeyInvalid =
    keySource === "raw" &&
    rawKey.trim() !== "" &&
    !rawKeyIsValid(rawKey, requiredBits);
  const iterationsInvalid =
    keySource === "password" &&
    (!Number.isInteger(options.pbkdf2Iterations) ||
      options.pbkdf2Iterations < 1000 ||
      options.pbkdf2Iterations > 10000000);
  const keyMissing =
    keySource === "password"
      ? password.length === 0
      : rawKey.trim() === "" || rawKeyInvalid;
  const canRun =
    !busy &&
    !reading &&
    !inspecting &&
    !keyMissing &&
    !iterationsInvalid &&
    (decrypt ? Boolean(details) : Boolean(file || text));

  function clearOutput() {
    revision.current++;
    controller.current?.abort();
    controller.current = null;
    setResult(null);
    setError("");
    setBusy(false);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setDownload(null);
  }

  useEffect(
    () => () => {
      revision.current++;
      readRevision.current++;
      controller.current?.abort();
      inspectionController.current?.abort();
      reader.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  useEffect(() => {
    setDetails(null);
    setInspectionError("");
    if (!decrypt || !input) {
      setInspecting(false);
      return;
    }
    const nextController = new AbortController();
    inspectionController.current = nextController;
    setInspecting(true);
    const timer = window.setTimeout(() => {
      void runAesWorker({ kind: "inspect", input }, nextController.signal)
        .then((value) => {
          if (!nextController.signal.aborted && value.kind === "inspected") {
            setDetails(value);
          }
        })
        .catch((cause) => {
          if (!nextController.signal.aborted) {
            setInspectionError(
              cause instanceof AesToolError ? cause.code : "invalid_envelope",
            );
          }
        })
        .finally(() => {
          if (!nextController.signal.aborted) setInspecting(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      nextController.abort();
    };
  }, [decrypt, input]);

  function change<K extends keyof EncryptOptions>(
    key: K,
    value: EncryptOptions[K],
  ) {
    clearOutput();
    setOptions((current) => ({ ...current, [key]: value }));
  }

  function clearInspection() {
    inspectionController.current?.abort();
    setDetails(null);
    setInspectionError("");
    setInspecting(false);
  }

  function removeFile(clearText = false) {
    clearInspection();
    readRevision.current++;
    reader.current?.abort();
    setReading(false);
    clearOutput();
    setFile(null);
    if (clearText) setText("");
  }

  function load(selected: File) {
    removeFile();
    if (selected.size > (decrypt ? MAX_AES_ENVELOPE : MAX_AES_BYTES)) {
      setError("too_large");
      return;
    }
    const current = readRevision.current;
    const nextReader = new FileReader();
    reader.current = nextReader;
    setReading(true);
    nextReader.onload = () => {
      if (current !== readRevision.current) return;
      try {
        const bytes = new Uint8Array(nextReader.result as ArrayBuffer);
        setFile(
          decrypt
            ? {
                name: selected.name,
                type: selected.type,
                size: selected.size,
                json: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
              }
            : {
                name: selected.name,
                type: selected.type,
                size: selected.size,
                bytes,
              },
        );
      } catch {
        setError("read_failed");
      }
      setReading(false);
    };
    nextReader.onerror = () => {
      if (current === readRevision.current) {
        setReading(false);
        setError("read_failed");
      }
    };
    nextReader.readAsArrayBuffer(selected);
  }

  function reset() {
    removeFile();
    setText("");
    setPassword("");
    setRawKey("");
    setOptions({ ...aesDefaults });
  }

  async function run() {
    clearOutput();
    const current = revision.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setBusy(true);
    try {
      if (!canRun) {
        throw new AesToolError(
          iterationsInvalid ? "invalid_options" : "invalid_input",
        );
      }
      const material =
        keySource === "password" ? { password } : { rawKeyHex: rawKey };
      const output = await runAesWorker(
        decrypt
          ? { kind: "decrypt", input, material }
          : {
              kind: "encrypt",
              input: file?.bytes ?? text,
              options: { ...options, ...material },
              metadata: file
                ? {
                    type: "file",
                    name: file.name,
                    mimeType: file.type || "application/octet-stream",
                    size: file.bytes?.length ?? 0,
                  }
                : { type: "text" },
            },
        nextController.signal,
      );
      if (current !== revision.current || output.kind === "inspected") return;
      setResult(output);
      const name =
        output.kind === "encrypted"
          ? file
            ? `${file.name}.aes.json`
            : "aes-encrypted.json"
          : output.metadata.type === "file"
            ? aesDownloadName(output.metadata.name)
            : output.text === null
              ? "decrypted.bin"
              : "aes-decrypted.txt";
      const blob =
        output.kind === "encrypted"
          ? new Blob([output.json], {
              type: "application/json;charset=utf-8",
            })
          : new Blob([new Uint8Array(output.bytes)], {
              type:
                output.metadata.type === "file" || output.text === null
                  ? "application/octet-stream"
                  : "text/plain;charset=utf-8",
            });
      const link = URL.createObjectURL(blob);
      url.current = link;
      setDownload({ url: link, name });
    } catch (cause) {
      if (current === revision.current && !nextController.signal.aborted) {
        setError(cause instanceof AesToolError ? cause.code : "invalid_input");
      }
    } finally {
      if (current === revision.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  const outputText =
    result?.kind === "encrypted" ? result.json : (result?.text ?? null);
  const inputTitle = decrypt
    ? m["shared.aesTools.decryptinputcardtitle"]()
    : m["shared.aesTools.encryptinputcardtitle"]();
  const inputDescription = decrypt
    ? m["shared.aesTools.decryptinputcarddescription"]()
    : m["shared.aesTools.encryptinputcarddescription"]();
  const inputLabel = decrypt
    ? m["shared.aesTools.decryptjsoninputlabel"]()
    : m["shared.aesTools.encrypttextinputlabel"]();
  const chooseFileLabel = decrypt
    ? m["shared.aesTools.decryptchoosefilelabel"]()
    : m["shared.aesTools.encryptchoosefilelabel"]();
  const clearFileLabel = decrypt
    ? m["shared.aesTools.decryptclearfilelabel"]()
    : m["shared.aesTools.encryptclearfilelabel"]();
  const processingLabel = decrypt
    ? m["shared.aesTools.decryptprocessing"]()
    : m["shared.aesTools.encryptprocessing"]();
  const passwordLabel = decrypt
    ? m["shared.aesTools.decryptpasswordlabel"]()
    : m["shared.aesTools.encryptpasswordlabel"]();
  const rawKeyLabel = decrypt
    ? m["shared.aesTools.decryptrawkeylabel"]()
    : m["shared.aesTools.encryptrawkeylabel"]();
  const sourcePasswordLabel = decrypt
    ? m["shared.aesTools.decryptpasswordsourcelabel"]()
    : m["shared.aesTools.encryptpasswordsourcelabel"]();
  const sourceRawKeyLabel = decrypt
    ? m["shared.aesTools.decryptrawkeysourcelabel"]()
    : m["shared.aesTools.encryptrawkeysourcelabel"]();
  const resultTitle = decrypt
    ? m["shared.aesTools.decryptresultcardtitle"]()
    : m["shared.aesTools.encryptresultcardtitle"]();
  const downloadLabel = decrypt
    ? result?.kind === "decrypted" && result.metadata.type === "file"
      ? m["shared.aesTools.decryptdownloadfilelabel"]()
      : m["shared.aesTools.decryptdownloadplaintextlabel"]()
    : m["shared.aesTools.encryptdownloadjsonlabel"]();

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 lg:grid-cols-2 lg:items-start"
        data-tool-panels
      >
        <div className="grid gap-6">
          <ToolPanelCard>
            <PanelHeader title={inputTitle} description={inputDescription} />
            <ToolPanelCardContent className="gap-5 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`${id}-input`}>
                  {inputLabel}
                </label>
                <TextArea
                  id={`${id}-input`}
                  className={`resize-y font-mono ${decrypt ? "min-h-56 text-xs" : "min-h-44 text-sm"}`}
                  value={input}
                  disabled={Boolean(file)}
                  placeholder={
                    decrypt
                      ? m["shared.aesTools.decryptjsoninputplaceholder"]()
                      : m["shared.aesTools.encrypttextinputplaceholder"]()
                  }
                  spellCheck={false}
                  onChange={(event) => {
                    clearInspection();
                    clearOutput();
                    setText(event.target.value);
                  }}
                />
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <p className="text-sm font-medium">
                    {decrypt
                      ? m["shared.aesTools.decryptfileinputlabel"]()
                      : m["shared.aesTools.encryptfileinputlabel"]()}
                  </p>
                  <p className="text-sm text-muted">
                    {decrypt
                      ? m["shared.aesTools.decryptfileinputdescription"]()
                      : m["shared.aesTools.encryptfileinputdescription"]()}
                  </p>
                </div>
                <ToolFilePicker
                  label={chooseFileLabel}
                  accept={decrypt ? ["application/json", ".json"] : undefined}
                  fileName={file?.name}
                  clearLabel={clearFileLabel}
                  isDisabled={reading}
                  onSelect={load}
                  onClear={file ? () => removeFile(decrypt) : undefined}
                />
                {reading ? (
                  <p role="status" className="flex items-center gap-2 text-sm">
                    <Spinner size="sm" />
                    {processingLabel}
                  </p>
                ) : null}
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <PanelHeader
              title={
                decrypt
                  ? m["shared.aesTools.decryptkeycardtitle"]()
                  : m["shared.aesTools.encryptkeycardtitle"]()
              }
              description={
                decrypt
                  ? m["shared.aesTools.decryptkeycarddescription"]()
                  : m["shared.aesTools.encryptkeycarddescription"]()
              }
            />
            <ToolPanelCardContent className="gap-5 py-4">
              {!decrypt ? (
                <Choice
                  id={`${id}-source`}
                  label={m["shared.aesTools.encryptkeysourcelabel"]()}
                  value={options.keySource}
                  items={[
                    { value: "password", label: sourcePasswordLabel },
                    { value: "raw", label: sourceRawKeyLabel },
                  ]}
                  change={(value) =>
                    change("keySource", value as EncryptOptions["keySource"])
                  }
                />
              ) : (
                <div className="grid gap-1 text-sm">
                  <span className="text-muted">
                    {m["shared.aesTools.decryptenvelopekeysourcelabel"]()}
                  </span>
                  <span className="font-medium">
                    {keySource === "password"
                      ? sourcePasswordLabel
                      : sourceRawKeyLabel}
                  </span>
                </div>
              )}
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`${id}-key`}>
                  {keySource === "password" ? passwordLabel : rawKeyLabel}
                </label>
                {keySource === "password" ? (
                  <ToolPasswordInput
                    id={`${id}-key`}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={
                      decrypt
                        ? m["shared.aesTools.decryptpasswordplaceholder"]()
                        : m["shared.aesTools.encryptpasswordplaceholder"]()
                    }
                    value={password}
                    variant="primary"
                    showLabel={m["shared.aesTools.showpassword"]()}
                    hideLabel={m["shared.aesTools.hidepassword"]()}
                    isVisible={showPassword}
                    onVisibilityChange={setShowPassword}
                    onChange={(event) => {
                      clearOutput();
                      setPassword(event.target.value);
                    }}
                  />
                ) : (
                  <Input
                    id={`${id}-key`}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={rawKeyInvalid}
                    className="font-mono"
                    placeholder={
                      decrypt
                        ? details
                          ? `${requiredBits / 4} hex characters`
                          : m["shared.aesTools.decryptrawkeyplaceholder"]()
                        : m["shared.aesTools.encryptrawkeyplaceholder"]()
                    }
                    value={rawKey}
                    onChange={(event) => {
                      clearOutput();
                      setRawKey(event.target.value);
                    }}
                  />
                )}
                {keySource === "raw" ? (
                  <p
                    className={`text-sm ${rawKeyInvalid ? "text-danger" : "text-muted"}`}
                  >
                    {decrypt
                      ? m["shared.aesTools.decryptvalidationrawkeyinvalid"]()
                      : m["shared.aesTools.encryptvalidationrawkeyinvalid"]()}
                  </p>
                ) : null}
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>

          {decrypt ? (
            <ToolPanelCard>
              <PanelHeader
                title={m["shared.aesTools.decryptenvelopecardtitle"]()}
                description={m[
                  "shared.aesTools.decryptenvelopecarddescription"
                ]()}
              />
              <ToolPanelCardContent className="gap-5 py-4">
                {inspecting ? (
                  <p role="status" className="flex items-center gap-2 text-sm">
                    <Spinner size="sm" />
                    {m["shared.aesTools.decryptprocessing"]()}
                  </p>
                ) : inspectionError ? (
                  <Notice
                    title={m["shared.aesTools.decryptinvalidenvelopetitle"]()}
                    status="danger"
                    role="alert"
                  >
                    {errorMessage(inspectionError, true, keySource)}
                  </Notice>
                ) : details ? (
                  <EnvelopeDetailsView details={details} locale={locale} />
                ) : (
                  <EmptyState
                    icon={FileJson2}
                    title={m["shared.aesTools.decryptemptyenvelopetitle"]()}
                    description={m[
                      "shared.aesTools.decryptemptyenvelopedescription"
                    ]()}
                  />
                )}
              </ToolPanelCardContent>
              <ToolPanelCardFooter className="justify-between gap-3">
                <Button type="button" variant="ghost" size="sm" onPress={reset}>
                  <RefreshCcw aria-hidden className="size-4" />
                  {m["common.actions.reset"]()}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isDisabled={!canRun}
                  onPress={() => void run()}
                >
                  <Lock aria-hidden className="size-4" />
                  {m["shared.aesTools.decryptdecryptlabel"]()}
                </Button>
              </ToolPanelCardFooter>
            </ToolPanelCard>
          ) : (
            <ToolPanelCard>
              <PanelHeader
                title={m["shared.aesTools.encryptoptionscardtitle"]()}
                description={m[
                  "shared.aesTools.encryptoptionscarddescription"
                ]()}
              />
              <ToolPanelCardContent className="gap-5 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Choice
                    id={`${id}-mode`}
                    label={m["shared.aesTools.encryptmodelabel"]()}
                    value={options.mode}
                    items={[
                      {
                        value: "GCM",
                        label: m["shared.aesTools.encryptgcmmodelabel"](),
                      },
                      {
                        value: "CBC",
                        label: m["shared.aesTools.encryptcbcmodelabel"](),
                      },
                      {
                        value: "CTR",
                        label: m["shared.aesTools.encryptctrmodelabel"](),
                      },
                    ]}
                    change={(value) =>
                      change("mode", value as EncryptOptions["mode"])
                    }
                  />
                  <Choice
                    id={`${id}-bits`}
                    label={m["shared.aesTools.encryptkeylengthlabel"]()}
                    value={String(options.keyLengthBits)}
                    items={KEY_BITS.map((value) => ({
                      value: String(value),
                      label: `${value}-bit`,
                    }))}
                    change={(value) =>
                      change(
                        "keyLengthBits",
                        Number(value) as EncryptOptions["keyLengthBits"],
                      )
                    }
                  />
                </div>
                {keySource === "password" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor={`${id}-iterations`}
                      >
                        {m["shared.aesTools.encryptpbkdf2iterationslabel"]()}
                      </label>
                      <Input
                        id={`${id}-iterations`}
                        type="number"
                        min={1000}
                        max={10000000}
                        step={1000}
                        value={options.pbkdf2Iterations}
                        aria-invalid={iterationsInvalid}
                        onChange={(event) =>
                          change("pbkdf2Iterations", Number(event.target.value))
                        }
                      />
                      {iterationsInvalid ? (
                        <p className="text-sm text-danger">
                          {m[
                            "shared.aesTools.encryptvalidationiterationsinvalid"
                          ]()}
                        </p>
                      ) : null}
                    </div>
                    <Choice
                      id={`${id}-hash`}
                      label={m["shared.aesTools.encryptpbkdf2hashlabel"]()}
                      value={options.pbkdf2Hash}
                      items={[
                        {
                          value: "SHA-256",
                          label: m["shared.aesTools.encryptsha256label"](),
                        },
                        {
                          value: "SHA-384",
                          label: m["shared.aesTools.encryptsha384label"](),
                        },
                        {
                          value: "SHA-512",
                          label: m["shared.aesTools.encryptsha512label"](),
                        },
                      ]}
                      change={(value) =>
                        change(
                          "pbkdf2Hash",
                          value as EncryptOptions["pbkdf2Hash"],
                        )
                      }
                    />
                  </div>
                ) : null}
                <Notice
                  title={m["shared.aesTools.encryptsecuritynotetitle"]()}
                  status={algorithm === "AES-GCM" ? "default" : "warning"}
                >
                  {algorithm === "AES-GCM"
                    ? m["shared.aesTools.encryptgcmnote"]()
                    : algorithm === "AES-CBC"
                      ? m["shared.aesTools.encryptcbcwarning"]()
                      : m["shared.aesTools.encryptctrwarning"]()}
                </Notice>
              </ToolPanelCardContent>
              <ToolPanelCardFooter className="justify-between gap-3">
                <Button type="button" variant="ghost" size="sm" onPress={reset}>
                  <RefreshCcw aria-hidden className="size-4" />
                  {m["common.actions.reset"]()}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isDisabled={!canRun}
                  onPress={() => void run()}
                >
                  <Lock aria-hidden className="size-4" />
                  {m["shared.aesTools.encryptencryptlabel"]()}
                </Button>
              </ToolPanelCardFooter>
            </ToolPanelCard>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-6">
          <ToolPanelCard>
            <PanelHeader
              title={resultTitle}
              description={
                decrypt
                  ? m["shared.aesTools.decryptresultcarddescription"]()
                  : m["shared.aesTools.encryptresultcarddescription"]()
              }
            />
            <ToolPanelCardContent className="gap-4 py-4">
              {error ? (
                <Notice
                  title={
                    decrypt
                      ? m["shared.aesTools.decrypterrortitle"]()
                      : m["shared.aesTools.encrypterrortitle"]()
                  }
                  status="danger"
                  role="alert"
                >
                  {errorMessage(error, decrypt, keySource)}
                </Notice>
              ) : null}
              {busy ? (
                <p role="status" className="flex items-center gap-2 text-sm">
                  <Spinner size="sm" />
                  {processingLabel}
                </p>
              ) : null}
              {result ? (
                <ResultView result={result} outputText={outputText} />
              ) : (
                <EmptyState
                  icon={Lock}
                  title={
                    decrypt
                      ? m["shared.aesTools.decryptemptyresulttitle"]()
                      : m["shared.aesTools.encryptemptyresulttitle"]()
                  }
                  description={
                    decrypt
                      ? m["shared.aesTools.decryptemptyresultdescription"]()
                      : m["shared.aesTools.encryptemptyresultdescription"]()
                  }
                />
              )}
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="justify-end gap-3">
              <ToolCopyButton
                value={outputText ?? ""}
                copyLabel={
                  decrypt
                    ? m["shared.aesTools.decryptcopyplaintextlabel"]()
                    : m["shared.aesTools.encryptcopyjsonlabel"]()
                }
                copiedLabel={
                  decrypt
                    ? m["common.actions.copied"]()
                    : m["common.actions.copied"]()
                }
                disabled={outputText === null}
              />
              {download ? (
                <a
                  href={download.url}
                  download={download.name}
                  className={buttonVariants({ size: "sm" })}
                >
                  <Download aria-hidden className="size-4" />
                  {downloadLabel}
                </a>
              ) : (
                <Button type="button" size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {downloadLabel}
                </Button>
              )}
            </ToolPanelCardFooter>
          </ToolPanelCard>
        </div>
      </div>
      <AesArticle decrypt={decrypt} />
    </div>
  );
}

function EnvelopeDetailsView({
  details,
  locale,
}: {
  details: EnvelopeDetails;
  locale: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Chip size="sm" variant="soft">
          {details.algorithm}
        </Chip>
        <Chip size="sm" variant="secondary">
          {details.key.lengthBits}-bit
        </Chip>
        <Chip size="sm" variant="secondary">
          {details.key.source === "password"
            ? m["shared.aesTools.decryptpasswordsourcelabel"]()
            : m["shared.aesTools.decryptrawkeysourcelabel"]()}
        </Chip>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Detail
          label={m["shared.aesTools.decryptmodelabel"]()}
          value={details.algorithm}
        />
        <Detail
          label={m["shared.aesTools.decryptkeylengthlabel"]()}
          value={`${details.key.lengthBits}-bit`}
        />
        <Detail
          label={m["shared.aesTools.decryptkeysourcelabel"]()}
          value={
            details.key.source === "password"
              ? m["shared.aesTools.decryptpasswordsourcelabel"]()
              : m["shared.aesTools.decryptrawkeysourcelabel"]()
          }
        />
        {details.key.source === "password" ? (
          <>
            <Detail
              label={m["shared.aesTools.decryptpbkdf2hashlabel"]()}
              value={details.key.hash}
            />
            <Detail
              label={m["shared.aesTools.decryptpbkdf2iterationslabel"]()}
              value={new Intl.NumberFormat(locale).format(
                details.key.iterations,
              )}
            />
          </>
        ) : null}
        <Detail
          label={m["shared.aesTools.decryptplaintexttypelabel"]()}
          value={
            details.metadata.type === "file"
              ? m["shared.aesTools.decryptfileplaintextlabel"]()
              : m["shared.aesTools.decrypttextplaintextlabel"]()
          }
        />
        {details.metadata.type === "file" ? (
          <>
            <Detail
              label={m["shared.aesTools.decryptfilenamelabel"]()}
              value={details.metadata.name}
            />
            <Detail
              label={m["shared.aesTools.decryptfilesizelabel"]()}
              value={formatFileSize(details.metadata.size, locale)}
            />
          </>
        ) : null}
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function ResultView({
  result,
  outputText,
}: {
  result: CompletedResult;
  outputText: string | null;
}) {
  if (result.kind === "decrypted" && result.metadata.type === "file") {
    return (
      <EmptyState
        icon={FileText}
        title={m["shared.aesTools.decryptfileresulttitle"]()}
        description={m["shared.aesTools.decryptfileresultdescription"]()}
      />
    );
  }
  return (
    <div className="grid gap-3">
      {outputText !== null ? (
        <TextArea
          readOnly
          aria-label={
            result.kind === "decrypted"
              ? m["shared.aesTools.decryptplaintextresultlabel"]()
              : m["shared.aesTools.encryptresultcardtitle"]()
          }
          value={preview(outputText)}
          className="min-h-96 resize-y font-mono text-xs"
        />
      ) : null}
      {outputText !== null && outputText.length > 16000 ? (
        <p className="text-sm text-muted">
          {result.kind === "decrypted"
            ? m["shared.aesTools.decryptpreviewtruncated"]()
            : m["shared.aesTools.encryptpreviewtruncated"]()}
        </p>
      ) : null}
      {result.kind === "decrypted" ? (
        <>
          {result.sizeMatches === false ? (
            <Notice status="danger" role="status">
              {m["shared.aesTools.decryptsizemismatch"]()}
            </Notice>
          ) : null}
          {result.metadata.type === "text" && result.text === null ? (
            <Notice status="danger">
              {m["shared.aesTools.decryptbinarytext"]()}
            </Notice>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function AesArticle({ decrypt }: { decrypt: boolean }) {
  if (decrypt) {
    return (
      <ToolArticle>
        <p>{m["shared.aesTools.decryptarticleintrobody1"]()}</p>
        <p>{m["shared.aesTools.decryptarticleintrobody2"]()}</p>
        <h2>{m["shared.aesTools.decryptarticlewhentitle"]()}</h2>
        <p>
          {m["shared.aesTools.decryptarticlewhenbody1before"]()}
          <code>inbrowser-aes-v1</code>
          {m["shared.aesTools.decryptarticlewhenbody1after"]()}
        </p>
        <p>{m["shared.aesTools.decryptarticlewhenbody2"]()}</p>
        <h2>{m["shared.aesTools.decryptarticlenotestitle"]()}</h2>
        <p>{m["shared.aesTools.decryptarticlenotesbody1"]()}</p>
        <p>{m["shared.aesTools.decryptarticlenotesbody2"]()}</p>
      </ToolArticle>
    );
  }

  return (
    <ToolArticle>
      <h2>{m["shared.aesTools.encryptarticlewhattitle"]()}</h2>
      <p>{m["shared.aesTools.encryptarticlewhatbody1"]()}</p>
      <p>{m["shared.aesTools.encryptarticlewhatbody2"]()}</p>
      <h2>{m["shared.aesTools.encryptarticlewhentitle"]()}</h2>
      <p>{m["shared.aesTools.encryptarticlewhenbody1"]()}</p>
      <p>{m["shared.aesTools.encryptarticlewhenbody2"]()}</p>
      <h2>{m["shared.aesTools.encryptarticlenotestitle"]()}</h2>
      <p>{m["shared.aesTools.encryptarticlenotesbody1"]()}</p>
      <p>{m["shared.aesTools.encryptarticlenotesbody2"]()}</p>
    </ToolArticle>
  );
}

const AesEncryptorContent = () => <AesTool />;
const AesDecryptorContent = () => <AesTool decrypt />;

export const AesDecryptor = () => (
  <ToolPage>
    <AesDecryptorContent />
  </ToolPage>
);

export const AesEncryptor = () => (
  <ToolPage>
    <AesEncryptorContent />
  </ToolPage>
);
