"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth-client";

/**
 * Sign out.
 *
 * A button rather than a link: signing out is a mutation, and mutations must
 * not happen on a GET. A link would let any page (or a prefetcher) log the user
 * out by rendering an <img src>.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      className="hover:text-enamel disabled:opacity-60"
      onClick={async () => {
        setPending(true);
        await signOut();
        // Refresh so Server Components re-read the (now absent) session.
        router.refresh();
        router.push("/");
      }}
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
