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
  // Workspace packages ship raw TypeScript, so they are bundled rather than
  // resolved at runtime. Everything else stays external.
  noExternal: [/^@spreddpay\//],
  // Prisma's runtime is CommonJS and uses dynamic require("fs"), which cannot
  // survive being bundled into an ESM file. tsup only auto-externalises the
  // dependencies of *this* package, and @prisma/client belongs to
  // packages/db — so without naming it here it gets inlined and the process
  // dies at boot with `Dynamic require of "fs" is not supported`.
  external: ["@prisma/client", ".prisma/client", "@prisma/engines"],
});
