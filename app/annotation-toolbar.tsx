"use client";

import { Agentation } from "agentation";
import { useSyncExternalStore } from "react";

/**
 * Local dev and LAN (mDNS) names. `npm run dev` and `npm run dev:vinext` both
 * land here, on ports 3000 and 3001.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.local$/;

/**
 * The Cloudflare branch preview convention derived in
 * `.github/workflows/cloudflare-deployments.yml` — a branch slug, then `-cmsy`.
 * Production is the bare `cmsy.webdesignbyft.workers.dev`, which this
 * deliberately does not match, and neither does any custom domain.
 */
const PREVIEW_HOST = /-cmsy\.webdesignbyft\.workers\.dev$/;

/** Whether the annotation toolbar belongs on this host. Fails closed. */
export function showsAnnotationToolbar(hostname: string): boolean {
  return LOCAL_HOST.test(hostname) || PREVIEW_HOST.test(hostname);
}

/**
 * The annotation toolbar, on local dev and Cloudflare previews only — never in
 * production. Hostname rather than an env var, because a Workers Builds preview
 * compiles with `NODE_ENV=production` and carries no other build-time marker,
 * while the browser always knows where it is.
 */
/** The hostname never changes without a page load, so there is nothing to listen to. */
const neverChanges = () => () => {};

export function AnnotationToolbar() {
  // `useSyncExternalStore` rather than an effect: it takes an explicit server
  // snapshot, so the server and the hydrating client both render nothing and the
  // toolbar is decided on the client's first re-render. A `useState` initializer
  // would instead disagree with the server render and trip hydration.
  const visible = useSyncExternalStore(
    neverChanges,
    () => showsAnnotationToolbar(location.hostname),
    () => false,
  );

  return visible ? <Agentation /> : null;
}
