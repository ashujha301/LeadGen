import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/features/auth/auth.config";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

/**
 * Server Component / layout guard. Missing or expired sessions redirect to
 * /sign-in with callbackUrl preserved via middleware x-pathname.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user?.id) {
    const headerList = await headers();
    const currentPath = headerList.get("x-pathname") || "/";
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(currentPath)}`);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  };
}
