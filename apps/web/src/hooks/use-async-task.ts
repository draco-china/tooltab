import { useCallback, useEffect, useRef, useState } from "react";

type TaskState<Result> =
  | { status: "idle" | "running"; result: null; error: null }
  | { status: "success"; result: Result; error: null }
  | { status: "error"; result: null; error: unknown };

const idle = { status: "idle", result: null, error: null } as const;

/** Inputs remain owned by the caller; only the latest execution can publish. */
export function useAsyncTask<Input, Result>(
  execute: (input: Input, signal: AbortSignal) => Result | Promise<Result>,
) {
  const [state, setState] = useState<TaskState<Result>>(idle);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const invalidate = useCallback(() => {
    const previous = active.current;
    active.current = null;
    previous?.abort();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [invalidate]);

  const clear = useCallback(() => {
    invalidate();
    if (mounted.current) setState(idle);
  }, [invalidate]);

  const run = useCallback(
    async (input: Input) => {
      if (!mounted.current) return;
      invalidate();
      const controller = new AbortController();
      active.current = controller;
      setState({ status: "running", result: null, error: null });
      try {
        const value = await execute(input, controller.signal);
        if (active.current === controller)
          setState({ status: "success", result: value, error: null });
      } catch (error) {
        if (active.current === controller)
          setState({ status: "error", result: null, error });
      } finally {
        if (active.current === controller) active.current = null;
      }
    },
    [execute, invalidate],
  );

  return { ...state, busy: state.status === "running", clear, run };
}
