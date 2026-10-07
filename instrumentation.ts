/**
 * Server startup hook.
 *
 * `register()` runs once per server instance and must finish before any request
 * is handled, which makes it the right place to validate configuration.
 *
 * Why this file exists: lib/env.ts throws on invalid config, but Next lazily
 * loads route modules, so in a standalone build (the Docker image) nothing
 * imported it until the first request arrived. The server would start, report
 * itself up, and only then fail per-request. Validating here moves the failure
 * to boot, where it belongs.
 *
 * Note on the implementation: this file is compiled for BOTH the Node and Edge
 * runtimes, so its CODE must not reference Node-only APIs - an exit call fails
 * the Edge compile even when guarded at runtime, because the check is static.
 * Rethrowing achieves the same outcome portably: an error out of `register()`
 * aborts startup and exits non-zero.
 */

export async function register() {
  // Only the Node runtime serves this app's data-backed routes, and lib/env.ts
  // depends on Node-only modules.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    await import("./lib/env");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    // Printed as well as thrown: the thrown error may be wrapped by the time it
    // surfaces, and this message lists every invalid variable by name.
    console.error(`\n=== Startup aborted: invalid configuration ===\n${detail}\n`);

    throw error;
  }
}
