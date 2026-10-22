// Test fixture: writes a valid-looking result only after a delay, so after a
// short job deadline. Its output must be discarded.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

process.once("message", (job: { outDir: string; format: string }) => {
  setTimeout(() => {
    writeFileSync(join(job.outDir, `master.${job.format}`), "late");
    process.send?.(
      { v: 1, kind: "result", ok: false, code: "CORRUPT" },
      undefined,
      {},
      () => process.exit(0),
    );
  }, 3_000);
});
