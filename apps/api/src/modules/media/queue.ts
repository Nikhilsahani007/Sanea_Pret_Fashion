// The upload queue (D-088, QP-1 to QP-7, T-1 to T-5; phase-8-plan.md §5.7).
// Per API process: one active upload and up to `waiting` waiting ones.
// Capacity is reserved at admission, before any body byte is read. Every job
// carries an absolute deadline counted from admission (T-3); a waiting job
// also has its own shorter wait deadline. Each job releases its reservation
// exactly once, however it ends.

export type QueueTimings = {
  /** Queue-wait deadline (QP-4): 30 s. */
  readonly waitMs: number;
  /** Total deadline from admission (QP-5, T-3): 60 s. */
  readonly totalMs: number;
};

export const UPLOAD_TIMINGS: QueueTimings = { waitMs: 30_000, totalMs: 60_000 };

export type QueueStats = {
  active: number;
  queueDepth: number;
  rejectedFull: number;
  queueTimeouts: number;
  processingTimeouts: number;
  failures: number;
  completed: number;
};

export class QueueWaitTimeout extends Error {
  constructor() {
    super("upload waited too long in the queue");
    this.name = "QueueWaitTimeout";
  }
}

export class QueueCancelled extends Error {
  constructor() {
    super("upload left the queue");
    this.name = "QueueCancelled";
  }
}

type State = "waiting" | "active" | "released";

export class UploadJob {
  readonly admittedAt: number;
  readonly deadlineAt: number;
  #state: State;
  readonly #queue: UploadQueue;
  #resolve!: () => void;
  #reject!: (error: Error) => void;
  #waitTimer: ReturnType<typeof setTimeout> | undefined;
  /** Resolves when this job becomes active; rejects on wait timeout or cancel. */
  readonly turn: Promise<void>;

  constructor(
    queue: UploadQueue,
    now: number,
    totalMs: number,
    active: boolean,
  ) {
    this.#queue = queue;
    this.admittedAt = now;
    this.deadlineAt = now + totalMs;
    this.#state = active ? "active" : "waiting";
    this.turn = new Promise<void>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    // A rejected turn that nobody awaits must not crash the process.
    this.turn.catch(() => undefined);
    if (active) this.#resolve();
  }

  get state(): State {
    return this.#state;
  }

  /** Milliseconds left before the absolute deadline (never negative). */
  remainingMs(now: number): number {
    return Math.max(0, this.deadlineAt - now);
  }

  /** Releases the reservation. Safe to call more than once; acts once. */
  release(): boolean {
    if (this.#state === "released") return false;
    const was = this.#state;
    this.#state = "released";
    if (this.#waitTimer) clearTimeout(this.#waitTimer);
    if (was === "waiting") this.#reject(new QueueCancelled());
    this.#queue._released(this, was);
    return true;
  }

  /** @internal */
  _startWaitTimer(waitMs: number): void {
    this.#waitTimer = setTimeout(() => {
      if (this.#state !== "waiting") return;
      this.#state = "released";
      this.#queue._waitTimedOut(this);
      this.#reject(new QueueWaitTimeout());
    }, waitMs);
    this.#waitTimer.unref?.();
  }

  /** @internal */
  _activate(): void {
    if (this.#waitTimer) clearTimeout(this.#waitTimer);
    this.#state = "active";
    this.#resolve();
  }
}

export class UploadQueue {
  readonly capacity: number;
  readonly timings: QueueTimings;
  readonly #now: () => number;
  #active: UploadJob | null = null;
  readonly #waiting: UploadJob[] = [];
  readonly stats: QueueStats = {
    active: 0,
    queueDepth: 0,
    rejectedFull: 0,
    queueTimeouts: 0,
    processingTimeouts: 0,
    failures: 0,
    completed: 0,
  };

  constructor(
    capacity: number,
    timings: QueueTimings = UPLOAD_TIMINGS,
    now: () => number = Date.now,
  ) {
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 4)
      throw new RangeError(
        "waiting capacity must be a whole number from 0 to 4",
      );
    this.capacity = capacity;
    this.timings = timings;
    this.#now = now;
  }

  /** Reserves capacity, or returns null when the queue is full (QP-3). */
  admit(): UploadJob | null {
    const now = this.#now();
    if (!this.#active) {
      const job = new UploadJob(this, now, this.timings.totalMs, true);
      this.#active = job;
      this.#sync();
      return job;
    }
    if (this.#waiting.length >= this.capacity) {
      this.stats.rejectedFull++;
      return null;
    }
    const job = new UploadJob(this, now, this.timings.totalMs, false);
    this.#waiting.push(job);
    job._startWaitTimer(this.timings.waitMs);
    this.#sync();
    return job;
  }

  /** @internal */
  _released(job: UploadJob, was: State): void {
    if (was === "active" && this.#active === job) {
      this.#active = null;
      this.#next();
    } else if (was === "waiting") {
      this.#remove(job);
    }
    this.#sync();
  }

  /** @internal */
  _waitTimedOut(job: UploadJob): void {
    this.#remove(job);
    this.stats.queueTimeouts++;
    this.#sync();
  }

  #remove(job: UploadJob): void {
    const i = this.#waiting.indexOf(job);
    if (i >= 0) this.#waiting.splice(i, 1);
  }

  #next(): void {
    const job = this.#waiting.shift();
    if (!job) return;
    this.#active = job;
    job._activate();
  }

  #sync(): void {
    this.stats.active = this.#active ? 1 : 0;
    this.stats.queueDepth = this.#waiting.length;
  }
}
