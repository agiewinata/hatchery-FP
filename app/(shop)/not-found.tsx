import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-20 text-center">
      <h1 className="font-display text-2xl font-bold">Not here</h1>
      <p className="text-sm text-muted-foreground">
        This page does not exist, or it is not public.
      </p>
      <Button asChild>
        <Link href="/products">Browse charms</Link>
      </Button>
    </div>
  );
}
