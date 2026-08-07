import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: [/^@spreddpay\//],
  // See apps/api/tsup.config.ts: Prisma's CJS runtime cannot be bundled into
  // ESM. bullmq and ioredis are the worker's own dependencies and tsup
  // externalises those automatically.
  external: ["@prisma/client", ".prisma/client", "@prisma/engines"],
});
