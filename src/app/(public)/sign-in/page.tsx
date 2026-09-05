import { redirect } from "next/navigation";

import { auth } from "@/features/auth/auth.config";
import { GoogleSignInButton } from "@/features/auth/google-sign-in-button";
import { APP_NAME } from "@/shared/config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/";
  const session = await auth();

  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-accent">{APP_NAME}</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Sign in</h1>
        <p className="text-sm text-muted">Use your Google account to continue.</p>
      </div>
      <GoogleSignInButton callbackUrl={callbackUrl} />
    </div>
  );
}
