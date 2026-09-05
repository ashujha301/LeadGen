"use client";

import { useTransition } from "react";

import { signOutAction } from "@/features/auth/actions";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const url = await signOutAction();
          window.location.href = url;
        });
      }}
      className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-raised/50 hover:text-white disabled:opacity-60"
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
