import { Suspense } from "react";

import { LoginForm } from "@/components/auth-forms";
import { isGoogleOAuthEnabled } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  // Read on the server: the client never needs the credentials themselves,
  // only whether to offer the button.
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <Suspense fallback={null}>
        <LoginForm googleEnabled={isGoogleOAuthEnabled} />
      </Suspense>
    </div>
  );
}
