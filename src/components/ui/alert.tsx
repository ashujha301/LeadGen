import type { ReactNode } from "react";

type AlertVariant = "default" | "destructive";

const variantClasses: Record<AlertVariant, string> = {
  default: "border-[var(--border)] bg-surface text-white",
  destructive: "border-red-500/50 bg-red-500/10 text-red-200",
};

export function Alert({
  title,
  children,
  variant = "default",
  className = "",
}: {
  title?: string;
  children: ReactNode;
  variant?: AlertVariant;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-md border p-4 ${variantClasses[variant]} ${className}`}
    >
      {title && <h5 className="mb-1 text-sm font-medium">{title}</h5>}
      <div className="text-sm">{children}</div>
    </div>
  );
}
