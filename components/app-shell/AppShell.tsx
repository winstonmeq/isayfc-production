// components/app-shell/AppShell.tsx
"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { AppSidebar } from "./AppSidebar";
import { AppModuleBar } from "./AppModuleBar";
import { AppTopbar } from "./AppTopbar";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("letson-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem("letson-sidebar-collapsed", String(next));
      }
      return next;
    });
  }

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#f4f7fa] text-slate-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block">
        <AppSidebar collapsed={mounted ? collapsed : false} onToggle={toggleSidebar} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={closeMobileMenu}
          />
          <div className="absolute inset-y-0 left-0">
            <AppSidebar
              collapsed={false}
              mobile
              onToggle={closeMobileMenu}
              onNavigate={closeMobileMenu}
            />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-screen transition-[padding] duration-300 ease-out",
          mounted && collapsed ? "lg:pl-[72px]" : "lg:pl-[252px]"
        )}
      >
        <AppTopbar
          collapsed={mounted ? collapsed : false}
          onToggle={toggleSidebar}
          onMobileMenu={() => setMobileOpen(true)}
        />
        <AppModuleBar />

        <main className="mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
