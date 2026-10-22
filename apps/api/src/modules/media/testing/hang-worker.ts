// Test fixture: accepts a job and never answers, keeping a CPU busy, like a
// native AVIF encode that ignores timeouts. The parent must kill it.
process.once("message", () => {
  setInterval(() => {
    const end = Date.now() + 50;
    while (Date.now() < end);
  }, 1);
});
