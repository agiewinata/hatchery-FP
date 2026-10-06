import { SiteFooter, SiteHeader } from "@/components/site-header";

/**
 * Public storefront shell. The route group keeps the header/footer out of the
 * auth pages without changing any URLs.
 */
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <SiteFooter />
    </>
  );
}
