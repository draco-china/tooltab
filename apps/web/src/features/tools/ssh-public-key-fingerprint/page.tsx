import { downloadUrl } from "@/lib/download";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card, TextArea } from "@heroui/react";
import { Download, FileSearch, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import type { SshJob, SshResult } from "../ssh-tools/jobs";
import { MAX_SSH_INPUT, SshError } from "@workspace/tools/crypto/ssh";
import { runSsh } from "../ssh-tools/worker-client";

const errorMessages = {
  ssh_error_too_large: m["shared.sshTools.errorTooLarge"],
  ssh_error_invalid_unicode: m["shared.sshTools.errorInvalidUnicode"],
  ssh_error_invalid_comment: m["shared.sshTools.errorInvalidComment"],
  ssh_error_invalid_size: m["shared.sshTools.errorInvalidSize"],
  ssh_error_invalid_algorithm: m["shared.sshTools.errorInvalidAlgorithm"],
  ssh_error_invalid_blob: m["shared.sshTools.errorInvalidBlob"],
  ssh_error_invalid_line: m["shared.sshTools.errorInvalidLine"],
  ssh_error_key_type_mismatch: m["shared.sshTools.errorKeyTypeMismatch"],
  ssh_error_too_many_keys: m["shared.sshTools.errorTooManyKeys"],
  ssh_error_timeout: m["shared.sshTools.errorTimeout"],
  ssh_error_worker_failed: m["shared.sshTools.errorWorkerFailed"],
  ssh_error_operation_failed: m["shared.sshTools.errorOperationFailed"],
  ssh_error_copy_failed: m["shared.ssh.errorCopyFailed"],
  ssh_error_file_failed: m["shared.ssh.errorFileFailed"],
  ssh_error_busy: m["shared.sshTools.errorBusy"],
} as const;

function errorKey(code: string) {
  const key = `ssh_error_${code}`;
  return Object.hasOwn(errorMessages, key)
    ? (key as keyof typeof errorMessages)
    : "ssh_error_operation_failed";
}
function useTask() {
  const [result, setResult] = useState<SshResult | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    revision = useRef(0),
    copyRevision = useRef(0),
    controller = useRef<AbortController | null>(null),
    url = useRef<string | null>(null);
  const invalidate = useCallback(() => {
    revision.current++;
    controller.current?.abort();
    controller.current = null;
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
  }, []);
  const clear = useCallback(() => {
    invalidate();
    setResult(null);
    setError("");
    setNotice("");
    setBusy(false);
  }, [invalidate]);
  useEffect(() => invalidate, [invalidate]);
  async function run(job: SshJob) {
    clear();
    const current = revision.current,
      abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const value = await runSsh(job, abort.signal);
      if (current === revision.current) setResult(value);
    } catch (e) {
      if (current === revision.current && !abort.signal.aborted)
        setError(
          errorMessages[
            errorKey(e instanceof SshError ? e.code : "operation_failed")
          ]({}),
        );
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  async function copy(value: string) {
    const current = revision.current;
    const copyCurrent = ++copyRevision.current;
    try {
      await navigator.clipboard.writeText(value);
      if (current === revision.current && copyCurrent === copyRevision.current)
        setNotice(m["common.actions.copied"]());
    } catch {
      if (current === revision.current && copyCurrent === copyRevision.current)
        setError(m["shared.ssh.errorCopyFailed"]());
    }
  }
  function save(value: string, name: string) {
    try {
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(
        new Blob([value], { type: "text/plain;charset=utf-8" }),
      );
      downloadUrl(url.current, name);
      setNotice(m["shared.ssh.saved"]());
    } catch {
      setError(m["shared.ssh.errorFileFailed"]());
    }
  }
  return {
    result,
    error,
    notice,
    busy,
    clear,
    run,
    copy,
    save,
    revision,
    setError,
  };
}
function Output({
  label,
  value,
  name,
  language,
  task,
}: {
  label: string;
  value: string;
  name: string;
  language?: string;
  task: ReturnType<typeof useTask>;
}) {
  const id = useId();
  return (
    <div className="grid gap-3 border-b border-separator py-4 last:border-b-0">
      {language ? (
        <CodeBlock
          code={value}
          title={label}
          language={language}
          copyLabel={`${m["common.actions.copy"]()} ${label}`}
          maxHeightClassName="min-h-24 max-h-80"
        />
      ) : (
        <>
          <label className="text-sm font-medium" htmlFor={id}>
            {label}
          </label>
          <TextArea
            id={id}
            value={value}
            readOnly
            className="min-h-24 font-mono"
          />
        </>
      )}
      <ToolPanelActionGroup>
        {!language && (
          <Button variant="outline" onClick={() => void task.copy(value)}>
            {m["common.actions.copy"]()}
          </Button>
        )}
        <Button variant="outline" onClick={() => task.save(value, name)}>
          <Download aria-hidden className="size-4" />
          {m["common.actions.download"]()}
        </Button>
      </ToolPanelActionGroup>
    </div>
  );
}
function Feedback({ task }: { task: ReturnType<typeof useTask> }) {
  return (
    <>
      {task.error && (
        <p role="alert" className="text-destructive">
          {task.error}
        </p>
      )}
      {task.notice && (
        <p role="status" className="text-muted-foreground">
          {task.notice}
        </p>
      )}
    </>
  );
}
const SAMPLE =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINdamAGCsQq31Uv+08lkBzoO4XLz2qYjJa8CGmj3B1Ea RFC8032-public-test-key";
function SshPublicKeyFingerprintContent() {
  const task = useTask(),
    [input, setInput] = useState(""),
    [page, setPage] = useState(0),
    id = useId(),
    result = task.result && "results" in task.result ? task.result : null;
  async function load(file: File) {
    task.clear();
    const current = task.revision.current;
    try {
      if (file.size > MAX_SSH_INPUT) throw new SshError("too_large");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (current === task.revision.current) setInput(text);
    } catch (e) {
      if (current === task.revision.current)
        task.setError(
          errorMessages[
            errorKey(
              e instanceof SshError
                ? e.code
                : e instanceof TypeError
                  ? "invalid_unicode"
                  : "file_failed",
            )
          ]({}),
        );
    }
  }
  return (
    <div className="grid gap-6" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <Card.Title>
              {m["tools.sshPublicKeyFingerprint.input"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.sshPublicKeyFingerprint.fingerprintNote"]()}
            </Card.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
            <Button
              variant="outline"
              onClick={() => {
                task.clear();
                setInput(SAMPLE);
              }}
            >
              {m["tools.sshPublicKeyFingerprint.sample"]()}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                task.clear();
                setInput("");
              }}
            >
              <RotateCcw aria-hidden className="size-4" />
              {m["common.actions.reset"]()}
            </Button>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <TextArea
            id={id}
            aria-label={m["tools.sshPublicKeyFingerprint.input"]()}
            value={input}
            spellCheck={false}
            autoComplete="off"
            className="min-h-64 font-mono"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) void load(file);
            }}
            onChange={(e) => {
              task.clear();
              setInput(e.target.value);
            }}
          />
          <ToolFilePicker
            label={m["tools.sshPublicKeyFingerprint.file"]()}
            onSelect={(file) => void load(file)}
          />
          {!result && task.error ? <Feedback task={task} /> : null}
        </ToolPanelCardContent>
        <ToolPanelCardFooter className="justify-end">
          <ToolPanelActionGroup className="justify-end">
            <Button
              isDisabled={task.busy || !input.trim()}
              onClick={() => {
                setPage(0);
                void task.run({ mode: "fingerprint", input });
              }}
            >
              <FileSearch aria-hidden className="size-4" />
              {task.busy
                ? m["shared.ssh.busy"]()
                : m["tools.sshPublicKeyFingerprint.inspect"]()}
            </Button>
            {task.busy ? (
              <Button variant="outline" onClick={task.clear}>
                <X aria-hidden className="size-4" />
                {m["common.actions.cancel"]()}
              </Button>
            ) : null}
          </ToolPanelActionGroup>
        </ToolPanelCardFooter>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["shared.ssh.sha256"]()} /{" "}
            {m["tools.sshPublicKeyFingerprint.md5"]()}
          </Card.Title>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          {!result ? (
            <div className="flex min-h-40 items-center justify-center text-center text-sm text-muted">
              {m["tools.sshPublicKeyFingerprint.inspect"]()}
            </div>
          ) : (
            <div className="grid gap-4">
              <Feedback task={task} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  isDisabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {m["tools.sshPublicKeyFingerprint.previous"]()}
                </Button>
                <span>
                  {page + 1} /{" "}
                  {Math.max(
                    1,
                    Math.ceil(
                      Math.max(result.results.length, result.errors.length) /
                        50,
                    ),
                  )}
                </span>
                <Button
                  variant="outline"
                  isDisabled={
                    (page + 1) * 50 >=
                    Math.max(result.results.length, result.errors.length)
                  }
                  onClick={() => setPage((p) => p + 1)}
                >
                  {m["tools.sshPublicKeyFingerprint.next"]()}
                </Button>
              </div>
              {!result.results.length && !result.errors.length && (
                <p role="status">
                  {m["tools.sshPublicKeyFingerprint.empty"]()}
                </p>
              )}
              {result.errors.length > 0 && (
                <div role="alert" className="space-y-1 text-destructive">
                  <p>{m["tools.sshPublicKeyFingerprint.errors"]()}</p>
                  {result.errors.slice(page * 50, (page + 1) * 50).map((e) => (
                    <p key={e.line}>
                      {m["tools.sshPublicKeyFingerprint.line"]()} {e.line}:{" "}
                      {errorMessages[errorKey(e.code)]({})}
                    </p>
                  ))}
                </div>
              )}
              {result.results.slice(page * 50, (page + 1) * 50).map((r) => (
                <section key={r.line} className="grid gap-3">
                  <h3 className="font-medium">
                    {m["tools.sshPublicKeyFingerprint.line"]()} {r.line} ·{" "}
                    {r.keyType}
                    {r.bits && ` · ${r.bits} ${m["shared.ssh.bits"]()}`}
                  </h3>
                  {r.curve && (
                    <p className="text-sm">
                      {m["tools.sshPublicKeyFingerprint.curve"]()}: {r.curve}
                    </p>
                  )}
                  {r.comment && (
                    <p className="text-sm wrap-break-word">{r.comment}</p>
                  )}
                  {!r.detailsChecked && (
                    <p className="text-sm text-muted-foreground">
                      {m["tools.sshPublicKeyFingerprint.detailsUnchecked"]()}
                    </p>
                  )}
                  <Output
                    label={m["shared.ssh.sha256"]()}
                    value={r.sha256}
                    name={`fingerprint-${r.line}.txt`}
                    task={task}
                  />
                  <Output
                    label={m["tools.sshPublicKeyFingerprint.md5"]()}
                    value={r.md5}
                    name={`fingerprint-md5-${r.line}.txt`}
                    task={task}
                  />
                </section>
              ))}
            </div>
          )}
        </ToolPanelCardContent>
        {result ? (
          <ToolPanelCardFooter className="justify-end">
            <Button
              variant="outline"
              onClick={() =>
                task.save(
                  JSON.stringify(result, null, 2),
                  "ssh-fingerprints.json",
                )
              }
            >
              <Download aria-hidden className="size-4" />
              {m["tools.sshPublicKeyFingerprint.downloadAll"]()}
            </Button>
          </ToolPanelCardFooter>
        ) : null}
      </ToolPanelCard>
    </div>
  );
}

export function SshPublicKeyFingerprint() {
  return (
    <ToolPage>
      <SshPublicKeyFingerprintContent />
    </ToolPage>
  );
}
