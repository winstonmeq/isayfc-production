// app/(dashboard)/sales/page.tsx
import { redirect } from "next/navigation";

export default function SalesPage() {
  redirect("/sales/all");
}
