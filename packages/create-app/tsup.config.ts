import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/create-reactor-app.ts"],
  outDir: "dist/bin",
  bundle: false,
  splitting: false,
  format: ["esm"],
  sourcemap: false,
  clean: true,
  shims: false,
  dts: false,
});
