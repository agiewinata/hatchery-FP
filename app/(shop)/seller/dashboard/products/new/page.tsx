import { ProductForm } from "@/components/product-form";
import { requireSeller } from "@/lib/data/auth";

export const metadata = { title: "Add a product" };

export default async function NewProductPage() {
  // Enforced here, not inherited from the layout.
  await requireSeller();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Add a product</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          New listings save as drafts. Publish when you are ready.
        </p>
      </div>
      <ProductForm />
    </div>
  );
}
