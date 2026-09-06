"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, Home, Link2, Search, ShieldCheck, Star } from "lucide-react";

import { SignOutButton } from "@/features/auth/sign-out-button";
import type { SessionUser } from "@/features/auth/session-guard";
import { APP_NAME } from "@/shared/config";

const NAV_ITEMS = [
  { href: "/", label: "Search", icon: Home },
  { href: "/high-value-leads", label: "High Value Leads", icon: Star },
  { href: "/connections", label: "Potential Connections", icon: Link2 },
  // { href: "/review", label: "Review", icon: ShieldCheck },
];

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-surface md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-4">
          <GitBranch className="h-5 w-5 text-accent" />
          <span className="text-sm font-semibold">{APP_NAME}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-surface-raised text-white"
                    : "text-muted hover:bg-surface-raised/50 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--border)] p-2">
          <p className="truncate px-3 pb-1 text-xs text-muted" title={user.email ?? undefined}>
            {user.email ?? user.name ?? "Signed in"}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-surface px-4 md:hidden">
          <div className="flex items-center">
            <Search className="mr-2 h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">{APP_NAME}</span>
          </div>
          <SignOutButton />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
