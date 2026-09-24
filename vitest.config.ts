import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// A config of its own so tests do not load vite.config.ts: the vinext and
// Cloudflare plugins there build the whole app and boot workerd, and unit tests
// need neither. Tests run in plain Node, not in the Workers runtime.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist", ".next"],
    // No test may reach a real database; see the stubs in db/index.test.ts.
    env: { DATABASE_URL: "" },
  },
});
