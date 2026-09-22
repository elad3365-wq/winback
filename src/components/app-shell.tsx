"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/settings", label: "Settings" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  businessName,
  email,
  children,
}: {
  businessName: string;
  email: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4 lg:flex">
        <div>
          <div className="px-2 py-2">
            <Logo href="/dashboard" />
          </div>
          <div className="mt-6">
            <NavLinks />
          </div>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <UserMenu businessName={businessName} email={email} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <Logo href="/dashboard" />
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? "Close" : "Menu"}
          </Button>
        </header>

        {mobileOpen ? (
          <div id="mobile-nav" className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <div className="mt-3 border-t border-slate-200 pt-3">
              <UserMenu businessName={businessName} email={email} />
            </div>
          </div>
        ) : null}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
