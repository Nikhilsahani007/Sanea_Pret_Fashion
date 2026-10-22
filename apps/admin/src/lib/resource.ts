// Loads data for a screen with loading, ready and error states, cancelling the
// request when the inputs change or the screen closes. No caching library (U8-2).
// `reload()` keeps the current data on screen while it refreshes, so forms
// holding unsaved input are not unmounted; a failed refresh is reported.
import { useCallback, useEffect, useRef, useState } from "react";

import { type ApiError, toApiError } from "../api/client.ts";

export type Resource<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: ApiError };

export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Resource<T> & { reload: () => void; set: (data: T) => void } {
  const [state, setState] = useState<Resource<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const refreshing = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const keep = refreshing.current;
    refreshing.current = false;
    setState((s) => (keep && s.status === "ready" ? s : { status: "loading" }));
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
    // `load` is recreated each render; `deps` decides when to reload.
  }, [...deps, version]);

  const reload = useCallback(() => {
    refreshing.current = true;
    setVersion((v) => v + 1);
  }, []);
  const set = useCallback((data: T) => setState({ status: "ready", data }), []);
  return { ...state, reload, set };
}
