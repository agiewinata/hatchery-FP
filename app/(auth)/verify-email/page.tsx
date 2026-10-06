import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Confirm your email" };

/**
 * Landing page after clicking a verification link. Better Auth has already
 * processed the token by the time the browser arrives here.
 */
export default function VerifyEmailPage() {
  return (
    <div className="space-y-6 text-center">
      <h1 className="font-display text-2xl font-bold">Email confirmed</h1>
      <p className="text-sm text-muted-foreground">
        Your address is verified. You can sign in and start buying or selling.
      </p>
      <Button asChild className="w-full">
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}
