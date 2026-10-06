"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Safety net for the storefront.
 *
 * Next sanitises error messages in production, so this deliberately shows a
 * generic message rather than pretending to explain. Anything that needs to
 * tell the user something specific does so with a typed result instead of by
 * throwing.
 */
export default function ShopError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-20 text-center">
      <h1 className="font-display text-2xl font-bold">That did not work</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong loading this page. Trying again often fixes it.
      </p>
      <div className="flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to the shop</Link>
        </Button>
      </div>
    </div>
  );
}
