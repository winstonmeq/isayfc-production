import { SectionHub } from "@/components/app-shell/SectionHub";
import { redirect } from "next/navigation";
import { canonicalReportPath } from "@/lib/report-navigation";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const { module } = await searchParams;
  if (module) {
    const canonical = canonicalReportPath(module);
    if (canonical !== module) redirect(canonical === "/pos" ? canonical : `/finance?module=${encodeURIComponent(canonical)}`);
  }
  if (module === "/profit/chicken-slicing") redirect(`/operations?module=${encodeURIComponent(module)}`);
  return <SectionHub section="Finance" />;
}
