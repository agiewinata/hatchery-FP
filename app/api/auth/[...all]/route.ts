/**
 * Better Auth HTTP handler.
 *
 * Mounts sign-in, sign-up, sign-out, email verification, password reset and the
 * Google OAuth callback. All of it is handled by the library - we add no custom
 * credential logic here.
 */
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
