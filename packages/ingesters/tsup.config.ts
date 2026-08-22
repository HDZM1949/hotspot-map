import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/scheduler.ts"],
  format: ["esm"],
  clean: true,
  noExternal: ["@hotspot-map/processor", "@hotspot-map/shared"],
});
