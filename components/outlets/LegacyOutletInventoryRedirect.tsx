"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export function LegacyOutletInventoryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/pos"); }, [router]);
  return <p className="p-4">Outlet inventory is now managed per outlet. <Link className="underline" href="/pos">Open Outlet Operations</Link></p>;
}
