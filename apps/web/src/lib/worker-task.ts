export type WorkerFailure =
  | "create"
  | "send"
  | "error"
  | "messageerror"
  | "timeout"
  | "closed"
  | "busy";

type WorkerEndpoint = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror"
>;

export type WorkerTaskOptions<Result> = {
  create: () => WorkerEndpoint;
  parse: (data: unknown) => Result;
  error: (failure: WorkerFailure) => Error;
  /** Omit to keep the worker alive until a response, failure, cancellation or close. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** One worker, one outstanding request. A failed exchange ends the session. */
export function createWorkerSession<Input, Result>(
  options: WorkerTaskOptions<Result>,
) {
  const { signal, error, parse } = options;
  signal?.throwIfAborted();
  let worker: WorkerEndpoint;
  try {
    worker = options.create();
  } catch {
    throw error("create");
  }
  let closed = false;
  let reason: unknown;
  let pending:
    | {
        resolve: (value: Result) => void;
        reject: (reason: unknown) => void;
        timer: ReturnType<typeof setTimeout> | undefined;
      }
    | undefined;

  function close(cause: unknown = error("closed")) {
    if (closed) return;
    closed = true;
    reason = cause;
    signal?.removeEventListener("abort", abort);
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    if (pending) {
      clearTimeout(pending.timer);
      const request = pending;
      pending = undefined;
      request.reject(cause);
    }
    worker.terminate();
  }

  function abort() {
    close(signal?.reason);
  }

  worker.onmessage = ({ data }) => {
    if (!pending || closed) return;
    let value: Result;
    try {
      value = parse(data);
    } catch (cause) {
      close(cause);
      return;
    }
    const request = pending;
    pending = undefined;
    clearTimeout(request.timer);
    request.resolve(value);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    close(error("error"));
  };
  worker.onmessageerror = () => close(error("messageerror"));
  signal?.addEventListener("abort", abort, { once: true });
  // A factory can synchronously abort while constructing its worker.
  if (signal?.aborted) abort();

  return {
    send(input: Input, transfer: Transferable[] = []): Promise<Result> {
      if (closed) return Promise.reject(reason);
      if (pending) return Promise.reject(error("busy"));
      return new Promise((resolve, reject) => {
        pending = {
          resolve,
          reject,
          timer:
            options.timeoutMs === undefined
              ? undefined
              : setTimeout(() => close(error("timeout")), options.timeoutMs),
        };
        try {
          worker.postMessage(input, transfer);
        } catch {
          close(error("send"));
        }
      });
    },
    close,
  };
}

export async function runWorkerTask<Input, Result>(
  input: Input,
  options: WorkerTaskOptions<Result>,
  transfer?: Transferable[],
): Promise<Result> {
  const session = createWorkerSession<Input, Result>(options);
  try {
    return await session.send(input, transfer);
  } finally {
    session.close();
  }
}

/** Decode the existing result/error envelope without changing tool error codes. */
export function workerResult<Result>(
  data: unknown,
  error: (code?: string) => Error,
): Result {
  if (!data || typeof data !== "object") throw error();
  if ("error" in data && typeof data.error === "string")
    throw error(data.error);
  if (!("result" in data)) throw error();
  return data.result as Result;
}

/** Worker entrypoints keep their own imports and transfer ownership policy. */
export function workerTaskHandler<Input, Result>(
  options: {
    run: (input: Input) => Result | Promise<Result>;
    error: (cause: unknown) => unknown;
    transfer?: (result: Result) => Transferable[];
  },
  post: (message: unknown, transfer: Transferable[]) => void,
) {
  return async ({ data }: MessageEvent<Input>) => {
    try {
      const result = await options.run(data);
      post({ result }, options.transfer?.(result) ?? []);
    } catch (cause) {
      post({ error: options.error(cause) }, []);
    }
  };
}
