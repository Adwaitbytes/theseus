import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@theseus/schema": fileURLToPath(new URL("../../packages/schema/src/index.ts", import.meta.url)),
      "@/": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: { include: ["lib/**/*.test.ts"] },
});
