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
 *
 * The failure path is handled explicitly. Better Auth resolves with an `error`
 * object rather than throwing, so an unchecked call looks like success; and if
 * the fetch itself rejects (offline, rejected origin), an unguarded `await`
 * leaves `pending` stuck on, which disables the button permanently and tells
 * the user nothing. Both cases now clear `pending` and surface the reason.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="hover:text-enamel disabled:opacity-60"
        onClick={async () => {
          setPending(true);
          setError(null);

          try {
            const { error: signOutError } = await signOut();

            if (signOutError) {
              setError(
                signOutError.message ??
                  `Sign out failed (HTTP ${signOutError.status ?? "unknown"}).`,
              );
              setPending(false);
              return;
            }
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Sign out could not reach the server.",
            );
            setPending(false);
            return;
          }

          // One navigation, not two. The previous router.refresh() before the
          // push cost a whole extra server round trip (~0.5s here) and bought
          // nothing: every page is dynamically rendered because the CSP nonce
          // forces it, and since Next 15 the Client Cache staleTime for
          // dynamic routes is 0, so this navigation already refetches from the
          // server rather than replaying a cached signed-in header. The
          // refresh also re-rendered the page being left behind, which on a
          // protected route redirects to /login and races the push.
          //
          // `replace`, not `push`: Back should not return to a page that still
          // looks signed in.
          router.replace("/");
        }}
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>

      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
