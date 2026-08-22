import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  clean: true,
  // workspace 包源码直接打进 bundle（dev 模式由 tsx/vite 直接编译源码）
  noExternal: ["@hotspot-map/processor", "@hotspot-map/shared"],
});
