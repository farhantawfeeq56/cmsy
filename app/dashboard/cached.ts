import { unstable_cache } from "next/cache";
import {
  getSpace,
  listComponentsInSpace,
  listDesignSystems,
  listPagesInSpace,
  listRecentActivity,
  listSpaces,
} from "@/db";

/**
 * Every cached dashboard read carries this tag, and every write expires it:
 * the dashboard's actions through `refresh()`, the MCP write tools in
 * `app/api/mcp/route.ts`. Anything else that writes to the database — a seed
 * script, a hand-run query, the stdio MCP entry — is caught by `REVALIDATE`.
 */
export const DASHBOARD_DATA = "dashboard-data";

/**
 * A backstop for writes that do not expire the tag. Past it, the next read
 * still answers from the cache and refreshes it in the background.
 */
const REVALIDATE = 300;

/**
 * The cache sits in Workers KV on Cloudflare (`kvDataAdapter` in
 * `vite.config.ts`), so a hit answers without a round trip to Neon. Keys are
 * versioned so a change to a row's shape can bump `v1` rather than read
 * entries a previous deploy wrote.
 */
function cached<A extends unknown[], R>(read: (...args: A) => Promise<R>, name: string) {
  return unstable_cache(read, ["v1", name], { tags: [DASHBOARD_DATA], revalidate: REVALIDATE });
}

export const cachedListSpaces = cached(listSpaces, "listSpaces");
export const cachedListRecentActivity = cached(listRecentActivity, "listRecentActivity");
export const cachedGetSpace = cached(getSpace, "getSpace");
export const cachedListPagesInSpace = cached(listPagesInSpace, "listPagesInSpace");
export const cachedListComponentsInSpace = cached(listComponentsInSpace, "listComponentsInSpace");
export const cachedListDesignSystems = cached(listDesignSystems, "listDesignSystems");
