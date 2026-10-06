import Link from "next/link";

/**
 * Auth shell. Narrow, centred, and without the shop chrome, so there is
 * nothing to do on these pages except the one task.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="font-display mb-10 text-center text-lg font-bold tracking-tight">
        Keychain
      </Link>
      {children}
    </main>
  );
}
