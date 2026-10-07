import Image from "next/image";
import Link from "next/link";

import { ProductStatusForm } from "@/components/product-status-form";
import { EmptyState, Price } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { requireSeller } from "@/lib/data/auth";
import { listOwnProducts } from "@/lib/data/products";

export const metadata = { title: "Your listings" };

const STATUS_LABELS = {
  DRAFT: "Draft",
  ACTIVE: "Live",
  ARCHIVED: "Archived",
} as const;

export default async function SellerProductsPage() {
  const { seller } = await requireSeller();
  const products = await listOwnProducts();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold">Your listings</h1>
        <Button asChild>
          <Link href="/seller/dashboard/products/new">Add a product</Link>
        </Button>
      </header>

      {!seller.isApproved && (
        <p className="rounded-md bg-secondary px-4 py-3 text-sm">
          Your shop is awaiting approval, so publishing is disabled for now. You can still prepare
          drafts.
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState
          title="No listings yet"
          action={
            <Button asChild>
              <Link href="/seller/dashboard/products/new">Add your first product</Link>
            </Button>
          }
        >
          Upload artwork for us to print, or list something you already have in stock.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {products.map((product) => (
            <li key={product.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-paper ring-1 ring-border">
                {product.images[0] && (
                  <Image
                    src={product.images[0].url}
                    alt={product.title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                )}
              </div>

              <div className="min-w-48 flex-1">
                <Link
                  href={`/seller/dashboard/products/${product.id}`}
                  className="font-medium hover:text-enamel"
                >
                  {product.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {product.fulfilmentType === "PRINT_ON_DEMAND"
                    ? "Printed by us"
                    : `You ship · ${product.stockQty ?? 0} in stock`}
                  {product._count.orderItems > 0 &&
                    ` · ${product._count.orderItems} sold`}
                </p>
              </div>

              <Price idr={product.priceIdr} className="w-28 text-right text-sm" />

              <span
                className={
                  product.status === "ACTIVE"
                    ? "rounded-full bg-ink px-2.5 py-0.5 text-xs text-primary-foreground"
                    : "rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                }
              >
                {STATUS_LABELS[product.status]}
              </span>

              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/seller/dashboard/products/${product.id}`}>Edit</Link>
                </Button>

                <ProductStatusForm
                  productId={product.id}
                  status={product.status}
                  canPublish={seller.isApproved}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
