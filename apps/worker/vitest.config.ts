import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Database-backed tests share fixtures; run them in one process.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
