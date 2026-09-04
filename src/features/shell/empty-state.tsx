import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-surface px-6 py-12 text-center">
      <Inbox className="mb-3 h-8 w-8 text-muted" />
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
