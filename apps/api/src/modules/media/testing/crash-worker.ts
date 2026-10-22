// Test fixture: crashes on receiving a job.
process.once("message", () => process.exit(3));
