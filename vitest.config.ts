import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for WinBack. Node environment (the code under test is pure
 * domain logic), with the `@/` alias mapped to ./src to match tsconfig.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The `server-only` marker has no runtime under vitest; stub it so
      // server-only modules (gmail crypto/oauth/reply) can be unit-tested.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
});
