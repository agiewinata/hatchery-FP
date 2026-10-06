import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
      {/* The token arrives in a search param, so this reads from useSearchParams. */}
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
