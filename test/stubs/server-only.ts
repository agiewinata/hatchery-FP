// Stub for the `server-only` package under vitest.
// The real package throws on import to prevent server code reaching a client
// bundle; tests already run in node, so there is nothing to guard against.
export {};
