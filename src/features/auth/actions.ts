"use server";

import { signIn as authSignIn, signOut as authSignOut } from "@/features/auth/auth.config";

export async function signOutAction() {
  await authSignOut({ redirect: false });
  return "/sign-in";
}

/**
 * With redirect:false, next-auth signIn resolves to the Google URL as a string.
 * Callers must use window.location.href (not router.push) for cross-origin nav.
 */
export async function signInWithGoogleAction(callbackUrl: string) {
  return await authSignIn("google", { redirect: false, redirectTo: callbackUrl });
}
