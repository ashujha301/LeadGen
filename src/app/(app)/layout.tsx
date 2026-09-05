import { requireSession } from "@/features/auth/session-guard";
import { AppShell } from "@/features/shell/app-shell";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  return <AppShell user={user}>{children}</AppShell>;
}
