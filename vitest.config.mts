import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. The pure modules (state machine, money maths, webhook
    // authentication) need no DOM and no database.
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // lib/env.ts fails fast on invalid config by design, so tests must supply a
    // complete, valid environment. These are throwaway values.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
      BETTER_AUTH_SECRET: "test-secret-value-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
      PAYMENT_PROVIDER: "XENDIT",
      XENDIT_SECRET_KEY: "xnd_development_test_key",
      XENDIT_CALLBACK_TOKEN: "test-callback-token",
      EMAIL_PROVIDER: "CONSOLE",
      UPLOAD_PROVIDER: "LOCAL",
    },
  },
  resolve: {
    alias: [
      {
        // `server-only` throws on import outside a server bundler graph. Under
        // vitest everything already runs in node, so stub it out.
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
      },
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
});
