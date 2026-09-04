"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  title: string;
  message: string;
  action?: ReactNode;
  onRetry?: () => void;
};

export function ErrorState({ title, message, action, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-red-500/30 bg-red-500/5 px-6 py-12 text-center">
      <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
      <h3 className="text-sm font-medium text-red-200">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-red-200/70">{message}</p>
      <div className="mt-4 flex gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}
