// Runs one image job in a killable child process (T-4). Resolves or rejects
// only after the child has actually exited, so the caller can keep the active
// upload slot until native work has stopped (phase-8-plan.md §5.7.2).
import { fork } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ImageFormat } from "./magic.ts";
import {
  OUTPUT_NAME,
  PROTOCOL_VERSION,
  resultMessage,
  type ResultMessage,
} from "./protocol.ts";

export const DEFAULT_WORKER = fileURLToPath(
  new URL("./image-worker.ts", import.meta.url),
);

export class WorkerTimeout extends Error {
  constructor() {
    super("image processing passed its deadline");
    this.name = "WorkerTimeout";
  }
}

export class WorkerAborted extends Error {
  constructor() {
    super("image processing was cancelled");
    this.name = "WorkerAborted";
  }
}

/** Crash, unexpected exit, malformed message or files that do not match. */
export class WorkerFailed extends Error {
  constructor(reason: string) {
    super(`image worker failed: ${reason}`);
    this.name = "WorkerFailed";
  }
}

export type WorkerJob = {
  readonly inputPath: string;
  readonly outDir: string;
  readonly format: ImageFormat;
  /** Milliseconds until the job deadline; the child is killed then. */
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly workerPath?: string;
  /** Called if the child has not exited some time after a kill. */
  readonly onSlowExit?: () => void;
};

export type WorkerOutcome = ResultMessage;

const SLOW_EXIT_MS = 5_000;

export async function runImageWorker(job: WorkerJob): Promise<WorkerOutcome> {
  const child = fork(job.workerPath ?? DEFAULT_WORKER, [], {
    // No secrets: the worker needs no configuration.
    env: {},
    execArgv: [],
    serialization: "json",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  let message: unknown;
  let messages = 0;
  let timedOut = false;
  let aborted = false;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;

  const kill = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGKILL");
    slowTimer ??= setTimeout(() => job.onSlowExit?.(), SLOW_EXIT_MS);
  };

  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  child.on("message", (m) => {
    messages++;
    if (messages === 1 && !timedOut && !aborted) message = m;
    // One message per job; the worker should exit next. Make sure it does.
    kill();
  });
  child.on("error", () => kill());

  const deadline = setTimeout(
    () => {
      timedOut = true;
      kill();
    },
    Math.max(0, job.timeoutMs),
  );
  const onAbort = () => {
    aborted = true;
    kill();
  };
  if (job.signal?.aborted) onAbort();
  job.signal?.addEventListener("abort", onAbort, { once: true });

  child.send({
    v: PROTOCOL_VERSION,
    kind: "process",
    inputPath: job.inputPath,
    outDir: job.outDir,
    format: job.format,
  });

  await exited;
  clearTimeout(deadline);
  if (slowTimer) clearTimeout(slowTimer);
  job.signal?.removeEventListener("abort", onAbort);

  // Late output after a deadline or cancel is ignored; the caller removes it.
  if (timedOut) throw new WorkerTimeout();
  if (aborted) throw new WorkerAborted();
  if (messages !== 1)
    throw new WorkerFailed(messages === 0 ? "no result" : "extra messages");
  const parsed = resultMessage.safeParse(message);
  if (!parsed.success) throw new WorkerFailed("malformed result");
  if (parsed.data.ok) await verifyFiles(job.outDir, parsed.data);
  return parsed.data;
}

/** The reported files must be exactly the files on disk, with their sizes. */
async function verifyFiles(
  outDir: string,
  result: Extract<ResultMessage, { ok: true }>,
): Promise<void> {
  const names = new Set(result.files.map((f) => f.name));
  if (names.size !== result.files.length)
    throw new WorkerFailed("duplicate files");
  if (!names.has(`master.${result.format}`))
    throw new WorkerFailed("no master");
  const onDisk = (await readdir(outDir)).sort();
  if (onDisk.join() !== [...names].sort().join())
    throw new WorkerFailed("files do not match");
  for (const f of result.files) {
    if (!OUTPUT_NAME.test(f.name)) throw new WorkerFailed("bad file name");
    if ((await stat(join(outDir, f.name))).size !== f.bytes)
      throw new WorkerFailed("file size does not match");
  }
}
