import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The database-backed tests share fixtures, so they run in one process.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
