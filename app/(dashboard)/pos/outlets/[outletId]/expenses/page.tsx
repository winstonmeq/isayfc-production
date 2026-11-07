import { notFound } from "next/navigation";
import { isValidObjectId } from "mongoose";
import { OutletPosPageClient } from "@/components/pos/OutletPosPageClient";

export default async function Page({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params;
  if (!isValidObjectId(outletId)) notFound();
  return <OutletPosPageClient key={outletId} initialOutletId={outletId} view="expenses" />;
}
