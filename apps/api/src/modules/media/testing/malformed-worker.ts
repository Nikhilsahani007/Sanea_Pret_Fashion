// Test fixture: answers with a message that breaks the protocol.
process.once("message", () => {
  process.send?.(
    { v: 1, kind: "result", ok: true, files: [] },
    undefined,
    {},
    () => process.exit(0),
  );
});
