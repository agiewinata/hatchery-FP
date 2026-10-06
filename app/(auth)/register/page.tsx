import { Suspense } from "react";

import { RegisterForm } from "@/components/auth-forms";
import { isGoogleOAuthEnabled } from "@/lib/env";

export const metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Create an account</h1>
      <Suspense fallback={null}>
        <RegisterForm googleEnabled={isGoogleOAuthEnabled} />
      </Suspense>
    </div>
  );
}
