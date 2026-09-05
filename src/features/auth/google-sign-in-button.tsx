"use client";

import { useState, useTransition } from "react";

import { signInWithGoogleAction } from "@/features/auth/actions";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const url = await signInWithGoogleAction(callbackUrl);
        if (typeof url !== "string" || !url) {
          setError("We couldn't start Google sign-in. Check AUTH_SECRET and Google credentials.");
          return;
        }
        window.location.href = url;
      } catch (err) {
        const digest = (err as { digest?: string } | null)?.digest;
        if (digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setError("We couldn't sign you in. Please try again.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-surface-raised px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-surface disabled:opacity-60"
      >
        <GoogleIcon />
        {isPending ? "Signing in…" : "Sign in with Google"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
