import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";

export default defineConfig({
  plugins: [
    vinext({
      cache: {
        // Cached dashboard reads (`app/dashboard/cached.ts`) live in Workers KV,
        // shared by every isolate, so a hit skips the round trip to Neon.
        // `tagCacheTtlMs: 0` makes every read check KV for an invalidation
        // rather than trust an isolate's memory of it for 5 s, so a write is
        // seen on the next render wherever that render runs. Off Cloudflare,
        // with no binding, vinext falls back to its in-memory cache.
        data: kvDataAdapter({ appPrefix: "cmsy", tagCacheTtlMs: 0 }),
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
