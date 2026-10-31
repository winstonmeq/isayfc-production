import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Slicing History",
};

export default function DailySlicingHistoryPage() {
  redirect("/slicing");
}
