import {
  decodeHashTextFile,
  hashTextBytes,
  isShakeAlgorithm,
  MAX_HASH_FILE_BYTES,
  MAX_HASH_TEXT_BYTES,
  type ShaAlgorithm,
  ShaHashError,
} from "@workspace/tools/hash/sha-input";
import { formatHash, type HashFormat } from "@workspace/tools/hash/format";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { hashBytes } from "@workspace/tools/hash/sha";
import { readHashFile } from "./logic";
export function ShaHashTool({ algorithm }: { algorithm: ShaAlgorithm }) {
  const id = useId();
  const shake = isShakeAlgorithm(algorithm);
  const [outputBits, setOutputBits] = useState(
    algorithm === "SHAKE128" ? "256" : "512",
  );
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<HashFormat>("hex");
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<ShaHashError["code"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const task = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      task.current?.abort();
      task.current = null;
    },
    [],
  );
  const previousAlgorithm = useRef(algorithm);
  useEffect(() => {
    if (previousAlgorithm.current !== algorithm) {
      task.current?.abort();
      setResult(null);
      setError(null);
      setOutputBits(algorithm === "SHAKE128" ? "256" : "512");
      previousAlgorithm.current = algorithm;
    }
  }, [algorithm]);
  function clearResult() {
    setResult(null);
    setError(null);
  }
  function cancel() {
    task.current?.abort();
    setCancelled(true);
    clearResult();
  }
  function reset() {
    if (task.current) cancel();
    setText("");
    setFile(null);
    setMode("text");
    setFormat("hex");
    setOutputBits(algorithm === "SHAKE128" ? "256" : "512");
    clearResult();
  }
  async function run(importFile?: File) {
    if (task.current) return;
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setCancelled(false);
    clearResult();
    let bytes: Uint8Array<ArrayBuffer> | undefined;
    try {
      if (importFile) {
        bytes = await readHashFile(
          importFile,
          MAX_HASH_TEXT_BYTES,
          controller.signal,
        );
        const imported = decodeHashTextFile(bytes);
        if (!controller.signal.aborted) setText(imported);
      } else {
        bytes =
          mode === "file" && file
            ? await readHashFile(file, MAX_HASH_FILE_BYTES, controller.signal)
            : hashTextBytes(text);
        const digest = await hashBytes(
          algorithm,
          bytes,
          controller.signal,
          shake ? Number(outputBits) : undefined,
        );
        if (!controller.signal.aborted) setResult(digest);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof ShaHashError ? cause.code : "digest-failed");
    } finally {
      bytes?.fill(0);
      if (task.current === controller) {
        task.current = null;
        setBusy(false);
        setCancelled(false);
      }
    }
  }
  const output = result ? formatHash(result, format) : "";
  const errorMessage =
    error === "invalid-length"
      ? m["shared.hashTextOrFile.shainvalidlength"]
      : error === "too-large"
        ? m["shared.hashTextOrFile.shatoolarge"]
        : error === "invalid-text"
          ? m["shared.hashTextOrFile.shainvalidtext"]
          : error === "unsupported"
            ? m["shared.hashTextOrFile.shaunsupported"]
            : error === "read-failed"
              ? m["common.shareadfailed"]
              : m["shared.hashTextOrFile.shadigestfailed"];
  return (
    <div className="grid gap-8">
      <div className="grid gap-6 lg:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["shared.hashTextOrFile.shamode"]()}</Card.Title>
            <Card.Description>
              {mode === "text"
                ? m["shared.hashTextOrFile.shatexthint"]()
                : m["shared.hashTextOrFile.shafilehint"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <ToggleButtonGroup
              selectionMode="single"
              selectedKeys={new Set([mode])}
              onSelectionChange={(selection) => {
                const value = String([...selection][0] ?? "");
                if (value) {
                  setMode(value);
                  clearResult();
                }
              }}
              isDisabled={busy}
              aria-label={m["shared.hashTextOrFile.shamode"]()}
              className="justify-start"
            >
              <ToggleButton id="text">
                {m["shared.hashTextOrFile.shatext"]()}
              </ToggleButton>
              <ToggleButton id="file">
                {m["shared.hashTextOrFile.shafile"]()}
              </ToggleButton>
            </ToggleButtonGroup>

            {mode === "text" ? (
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor={`${id}-text`}>
                    {m["shared.hashTextOrFile.shatextlabel"]()}
                  </Label>
                  <TextArea
                    id={`${id}-text`}
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      clearResult();
                    }}
                    disabled={busy}
                    className="min-h-48 flex-1 resize-y font-mono"
                    dir="auto"
                    spellCheck={false}
                    aria-describedby={`${id}-text-hint`}
                  />
                </div>
                <ToolFilePicker
                  label={m["shared.hashTextOrFile.shaimport"]()}
                  isDisabled={busy}
                  onSelect={(selected) => void run(selected)}
                />
              </div>
            ) : (
              <ToolFilePicker
                label={m["shared.hashTextOrFile.shachoosefile"]()}
                description={m["shared.hashTextOrFile.shafilehint"]()}
                clearLabel={m["common.actions.reset"]()}
                fileName={
                  file
                    ? m["shared.hashTextOrFile.shafilesummary"]({
                        name: file.name,
                        size: file.size,
                      })
                    : undefined
                }
                isDisabled={busy}
                onSelect={(selected) => {
                  setFile(selected);
                  clearResult();
                  if (selected.size > MAX_HASH_FILE_BYTES)
                    setError("too-large");
                }}
                onClear={() => {
                  setFile(null);
                  clearResult();
                }}
              />
            )}

            {shake ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-bits`}>
                  {m["shared.hashTextOrFile.shaoutputbits"]()}
                </Label>
                <Input
                  id={`${id}-bits`}
                  type="number"
                  min={8}
                  max={65536}
                  step={8}
                  value={outputBits}
                  disabled={busy}
                  onChange={(event) => {
                    setOutputBits(event.target.value);
                    clearResult();
                  }}
                  aria-describedby={`${id}-bits-hint`}
                />
                <p id={`${id}-bits-hint`} className="text-sm text-muted">
                  {m["shared.hashTextOrFile.shaoutputbitshint"]()}
                </p>
              </div>
            ) : null}
          </ToolPanelCardContent>
          <ToolPanelCardFooter>
            <ToolPanelActionGroup>
              <Button
                onPress={() => void run()}
                isDisabled={
                  busy ||
                  (mode === "file" &&
                    (!file || file.size > MAX_HASH_FILE_BYTES))
                }
              >
                {(busy
                  ? m["shared.hashTextOrFile.shabusy"]
                  : m["shared.hashTextOrFile.shagenerate"])({})}
              </Button>
              {busy ? (
                <Button
                  variant="outline"
                  onPress={cancel}
                  isDisabled={cancelled}
                >
                  {m["shared.hashTextOrFile.shacancel"]()}
                </Button>
              ) : null}
              <Button variant="ghost" onPress={reset}>
                {m["common.actions.reset"]()}
              </Button>
            </ToolPanelActionGroup>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>{m["shared.hashTextOrFile.sharesult"]()}</Card.Title>
              <Card.Description>
                {m["shared.hashTextOrFile.shadescription"]()}
              </Card.Description>
            </div>
            {busy ? <Spinner size="sm" /> : null}
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-busy={busy}>
            <Select
              variant="secondary"
              selectedKey={format}
              onSelectionChange={(key) =>
                key != null && setFormat(String(key) as HashFormat)
              }
            >
              <Label>{m["shared.hashTextOrFile.shaformat"]()}</Label>
              <Select.Trigger id={`${id}-format`}>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="hex" textValue="hex">
                    {m["shared.hashTextOrFile.shahex"]()}
                  </ListBox.Item>
                  <ListBox.Item id="base64" textValue="base64">
                    {m["shared.hashTextOrFile.shabase64"]()}
                  </ListBox.Item>
                  <ListBox.Item id="decimal" textValue="decimal">
                    {m["shared.hashTextOrFile.shadecimal"]()}
                  </ListBox.Item>
                  <ListBox.Item id="binary" textValue="binary">
                    {m["shared.hashTextOrFile.shabinary"]()}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            {error ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>{errorMessage({})}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`${id}-result`}>
                {m["shared.hashTextOrFile.sharesult"]()}
              </Label>
              <TextArea
                id={`${id}-result`}
                value={output}
                readOnly
                dir="ltr"
                className="min-h-48 flex-1 resize-y font-mono"
              />
            </div>

            {busy ? (
              <p role="status" className="text-sm text-muted">
                {(cancelled
                  ? m["shared.hashTextOrFile.shacancelling"]
                  : m["shared.hashTextOrFile.shabusy"])({})}
              </p>
            ) : null}
          </ToolPanelCardContent>
          <ToolPanelCardFooter>
            <ToolCopyButton
              value={busy ? "" : output}
              copyLabel={m["common.actions.copyResult"]()}
              copiedLabel={m["common.actions.copied"]()}
              errorLabel={m["shared.hashTextOrFile.shacopyfailed"]()}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        {algorithm === "SHA-1" ? (
          <p className="text-danger">
            {m["shared.hashTextOrFile.sha1warning"]()}
          </p>
        ) : null}
        <p>{m["shared.hashTextOrFile.shasecurity"]()}</p>
        <p>
          {(["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(algorithm)
            ? m["shared.hashTextOrFile.shacancellationhint"]
            : m["shared.hashTextOrFile.shasoftwarecancellationhint"])({})}
        </p>
      </ToolArticle>
    </div>
  );
}
import Sha1ToolContent from "./sha1-page";
export const Sha1Tool = () => (
  <ToolPage>
    <Sha1ToolContent />
  </ToolPage>
);
export { default as Sha256Tool } from "./sha256-page";
export { default as Sha384Tool } from "./sha384-page";
function Sha512ToolContent() {
  return <ShaHashTool algorithm="SHA-512" />;
}
import Sha224ToolContent from "./sha224-page";
export const Sha224Tool = () => (
  <ToolPage>
    <Sha224ToolContent />
  </ToolPage>
);
function Sha512224ToolContent() {
  return <ShaHashTool algorithm="SHA-512/224" />;
}
function Sha512256ToolContent() {
  return <ShaHashTool algorithm="SHA-512/256" />;
}
import Sha3224ToolContent from "./sha3-224-page";
export const Sha3224Tool = () => (
  <ToolPage>
    <Sha3224ToolContent />
  </ToolPage>
);
import Sha3256ToolContent from "./sha3-256-page";
export const Sha3256Tool = () => (
  <ToolPage>
    <Sha3256ToolContent />
  </ToolPage>
);
import Sha3384ToolContent from "./sha3-384-page";
export const Sha3384Tool = () => (
  <ToolPage>
    <Sha3384ToolContent />
  </ToolPage>
);
import Sha3512ToolContent from "./sha3-512-page";
export const Sha3512Tool = () => (
  <ToolPage>
    <Sha3512ToolContent />
  </ToolPage>
);
import Shake128ToolContent from "./shake128-page";
export const Shake128Tool = () => (
  <ToolPage>
    <Shake128ToolContent />
  </ToolPage>
);
import Shake256ToolContent from "./shake256-page";
export const Shake256Tool = () => (
  <ToolPage>
    <Shake256ToolContent />
  </ToolPage>
);

export function Sha512224Tool() {
  return (
    <ToolPage>
      <Sha512224ToolContent />
    </ToolPage>
  );
}

export function Sha512256Tool() {
  return (
    <ToolPage>
      <Sha512256ToolContent />
    </ToolPage>
  );
}

export function Sha512Tool() {
  return (
    <ToolPage>
      <Sha512ToolContent />
    </ToolPage>
  );
}
