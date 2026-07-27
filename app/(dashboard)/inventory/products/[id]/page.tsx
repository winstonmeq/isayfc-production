import { GroceryProductStockMovementDetailsPageClient } from "@/components/inventory/GroceryProductStockMovementDetailsPageClient";

export default async function GroceryProductStockMovementDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <GroceryProductStockMovementDetailsPageClient productId={id} />;
}
