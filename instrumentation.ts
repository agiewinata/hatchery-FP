/**
 * Server startup hook.
 *
 * `register()` runs once per server instance and must finish before any request
 * is handled, which makes it the right place to validate configuration.
 *
 * Why this file exists: lib/env.ts throws on invalid config, but Next lazily
 * loads route modules, so in a standalone build (the Docker image) nothing
 * imported it until the first request arrived. The server would start, report
 * itself up, and only then fail per-request. Importing env here moves that
 * failure to boot, where it belongs - a misconfigured deployment should refuse
 * to start rather than accept traffic it cannot serve.
 */

export async function register() {
  // The edge runtime does not run this app's server code and cannot load the
  // Node-only modules env.ts depends on, so validate in the Node runtime only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    await import("./lib/env");
  } catch (error) {
    // Print the full explanation (which lists every invalid variable), then
    // exit non-zero so an orchestrator sees a failed start instead of a
    // container that is up but broken.
    console.error(
      "\n=== Startup aborted: invalid configuration ===\n",
      error instanceof Error ? error.message : error,
      "\n",
    );
    process.exit(1);
  }
}
