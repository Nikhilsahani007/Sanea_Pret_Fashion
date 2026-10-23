// Loads one resource with cancellation; no server-state library (U8-2).
import { useEffect, useState } from "react";

import { toApiError, type ApiError } from "../api/client.ts";

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError; reload: () => void }
  | { status: "ready"; data: T; reload: () => void };

export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Resource<T> {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; error: ApiError }
    | { status: "ready"; data: T }
  >({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: "error", error: toApiError(error) });
      },
    );
    return () => controller.abort();
  }, [...deps, version]);

  const reload = () => setVersion((v) => v + 1);
  return state.status === "loading" ? state : { ...state, reload };
}
