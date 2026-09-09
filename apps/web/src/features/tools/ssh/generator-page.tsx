import { downloadUrl } from "@/lib/download";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Input, Label, ListBox, Select, TextArea } from "@heroui/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { m } from "@/paraglide/messages.js";
import type { SshJob, SshResult } from "../ssh-tools/jobs";
import { RSA_SIZES, type RsaSize, SshError } from "@workspace/tools/crypto/ssh";
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
function Choice({
  label,
  value,
  values,
  change,
}: {
  label: string;
  value: string;
  values: readonly string[];
  change: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <Select
        variant="secondary"
        selectedKey={value}
        onSelectionChange={(key) => key != null && change(String(key))}
      >
        <Label>{label}</Label>
        <Select.Trigger id={id} className="min-h-11 w-full">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Section>
              {values.map((v) => (
                <ListBox.Item key={v} id={v} textValue={v}>
                  {v}
                </ListBox.Item>
              ))}
            </ListBox.Section>
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
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
    <div>
      {language ? (
        <CodeBlock
          code={value}
          title={label}
          language={language}
          copyLabel={`${m["common.actions.copy"]()} ${label}`}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => task.save(value, name)}
            >
              {m["common.actions.download"]()}
            </Button>
          }
          maxHeightClassName="min-h-24 max-h-80"
        />
      ) : (
        <>
          <label htmlFor={id}>{label}</label>
          <TextArea
            id={id}
            value={value}
            readOnly
            className="min-h-24 font-mono"
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {!language && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => void task.copy(value)}
          >
            {m["common.actions.copy"]()}
          </Button>
        )}
        {!language && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => task.save(value, name)}
          >
            {m["common.actions.download"]()}
          </Button>
        )}
      </div>
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
function SshKeyGeneratorContent() {
  const task = useTask(),
    [algorithm, setAlgorithm] = useState("ed25519"),
    [size, setSize] = useState<RsaSize>(4096),
    [comment, setComment] = useState(""),
    id = useId(),
    result = task.result && "privateKey" in task.result ? task.result : null;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {m["shared.ssh.generatorNote"]()}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice
          label={m["shared.ssh.algorithm"]()}
          value={algorithm}
          values={["ed25519", "rsa"]}
          change={(v) => {
            task.clear();
            setAlgorithm(v);
          }}
        />
        {algorithm === "rsa" && (
          <Choice
            label={m["shared.ssh.size"]()}
            value={String(size)}
            values={RSA_SIZES.map(String)}
            change={(v) => {
              task.clear();
              setSize(Number(v) as RsaSize);
            }}
          />
        )}
      </div>
      <div>
        <label htmlFor={id}>{m["shared.ssh.comment"]()}</label>
        <Input
          id={id}
          value={comment}
          maxLength={4096}
          autoComplete="off"
          className="min-h-11"
          onChange={(e) => {
            task.clear();
            setComment(e.target.value);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          isDisabled={task.busy}
          onClick={() =>
            void task.run({
              mode: "generate",
              options: {
                algorithm: algorithm === "rsa" ? "rsa" : "ed25519",
                rsaSize: size,
                comment,
              },
            })
          }
        >
          {task.busy ? m["shared.ssh.busy"]() : m["shared.ssh.generate"]()}
        </Button>
        {task.busy && (
          <Button variant="outline" className="min-h-11" onClick={task.clear}>
            {m["common.actions.cancel"]()}
          </Button>
        )}
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            task.clear();
            setAlgorithm("ed25519");
            setSize(4096);
            setComment("");
          }}
        >
          {m["common.actions.reset"]()}
        </Button>
      </div>
      <Feedback task={task} />
      {result && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {result.keyType} · {result.bits} {m["shared.ssh.bits"]()}
            {result.comment && ` · ${result.comment}`}
          </p>
          <Output
            label={m["shared.ssh.public"]()}
            value={result.publicKey}
            name={`id_${result.algorithm}.pub`}
            language="SSH"
            task={task}
          />
          <Output
            label={m["shared.ssh.private"]()}
            value={result.privateKey}
            name={`id_${result.algorithm}`}
            language="PEM"
            task={task}
          />
          <Output
            label={m["shared.ssh.sha256"]()}
            value={result.fingerprintSha256}
            name="fingerprint.txt"
            task={task}
          />
        </div>
      )}
    </div>
  );
}

export default function SshKeyGenerator() {
  return (
    <ToolPage>
      <SshKeyGeneratorContent />
    </ToolPage>
  );
}
