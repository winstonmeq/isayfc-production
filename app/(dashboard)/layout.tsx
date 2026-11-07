// app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { AppShell } from "@/components/app-shell/AppShell";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <AppShell>
    {process.env.BUSINESS_TEST_MODE === "1" && (
      <div role="status" className="border border-amber-300 bg-amber-100 px-4 py-2 text-center font-semibold text-amber-950">
        TEST ENVIRONMENT — Separate test database. Not live business records.
      </div>
    )}
    {children}
  </AppShell>;
}
