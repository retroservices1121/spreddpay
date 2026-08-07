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
});
