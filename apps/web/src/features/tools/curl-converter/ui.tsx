import { downloadUrl } from "@/lib/download";
import { useCallback, useEffect, useRef, useState } from "react";
import { m } from "@/paraglide/messages.js";
import {
  type CurlOptions,
  CurlToolError,
} from "@workspace/tools/network/curl-contract";
import type { CurlResult } from "./types";
import { runCurl } from "./worker-client";

function errorMessage(code: string) {
  switch (code) {
    case "too_large":
      return m["tools.curlConverter.errorTooLarge"]();
    case "invalid_unicode":
      return m["tools.curlConverter.errorInvalidUnicode"]();
    case "invalid_target":
      return m["tools.curlConverter.errorInvalidTarget"]();
    case "output_too_large":
      return m["tools.curlConverter.errorOutputTooLarge"]();
    case "worker_failed":
      return m["tools.curlConverter.errorWorkerFailed"]();
    case "timeout":
      return m["tools.curlConverter.errorTimeout"]();
    case "busy":
      return m["tools.curlConverter.errorBusy"]();
    default:
      return m["tools.curlConverter.errorConversionFailed"]();
  }
}
export function useTask() {
  const [result, setResult] = useState<CurlResult | null>(null),
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
  async function run(job: CurlOptions) {
    clear();
    const current = revision.current,
      abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const value = await runCurl(job, abort.signal);
      if (current === revision.current) setResult(value);
    } catch (e) {
      if (current === revision.current && !abort.signal.aborted)
        setError(
          errorMessage(
            e instanceof CurlToolError ? e.code : "conversion_failed",
          ),
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
        setError(m["tools.curlConverter.errorCopyFailed"]());
    }
  }
  function save(value: string, name: string) {
    try {
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(
        new Blob([value], { type: "text/plain;charset=utf-8" }),
      );
      downloadUrl(url.current, name);
      setNotice(m["tools.curlConverter.saved"]());
    } catch {
      setError(m["tools.curlConverter.errorFileFailed"]());
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
export function Feedback({ task }: { task: ReturnType<typeof useTask> }) {
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
